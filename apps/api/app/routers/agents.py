import difflib
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import Agent, AgentRun, EvalResult, PromptVersion

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentCreate(BaseModel):
    name: str
    role: str
    goal: str
    system_prompt: str
    model: str = "MiniMax-M2.7"
    temperature: float = 0.3
    tools: list[str] = []
    enabled: bool = True


class AgentUpdate(BaseModel):
    role: Optional[str] = None
    goal: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    tools: Optional[list[str]] = None
    enabled: Optional[bool] = None


@router.get("")
def list_agents(session: Session = Depends(get_session)) -> list[Agent]:
    return list(session.exec(select(Agent).order_by(Agent.id)).all())


@router.post("", status_code=201)
def create_agent(payload: AgentCreate, session: Session = Depends(get_session)) -> Agent:
    existing = session.exec(select(Agent).where(Agent.name == payload.name)).first()
    if existing:
        raise HTTPException(409, f"Agent named {payload.name!r} already exists")
    agent = Agent(**payload.model_dump())
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent


@router.get("/{agent_id}")
def get_agent(agent_id: int, session: Session = Depends(get_session)) -> Agent:
    agent = session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent


@router.patch("/{agent_id}")
def update_agent(
    agent_id: int,
    payload: AgentUpdate,
    session: Session = Depends(get_session),
) -> Agent:
    agent = session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(agent, k, v)
    if data:
        agent.version += 1
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: int, session: Session = Depends(get_session)) -> None:
    agent = session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    session.delete(agent)
    session.commit()


# ---- Prompt history + revert ------------------------------------------

def _diff_lines(a: str, b: str) -> list[str]:
    """Return unified-diff lines comparing a → b (no header)."""
    a_lines = a.splitlines(keepends=False)
    b_lines = b.splitlines(keepends=False)
    return list(
        difflib.unified_diff(a_lines, b_lines, lineterm="", n=3)
    )[2:]  # drop the --- / +++ headers


@router.get("/{agent_id}/prompt-history")
def prompt_history(agent_id: int, session: Session = Depends(get_session)) -> list[dict]:
    agent = session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    versions = sorted(
        session.exec(
            select(PromptVersion).where(PromptVersion.agent_id == agent_id)
        ).all(),
        key=lambda p: p.version,
    )
    if not versions:
        return []

    # Window each version: active from its created_at to the next one (or now).
    runs = list(
        session.exec(select(AgentRun).order_by(AgentRun.created_at)).all()
    )

    out: list[dict] = []
    for i, pv in enumerate(versions):
        prev_prompt = versions[i - 1].prompt if i > 0 else ""
        next_pv = versions[i + 1] if i + 1 < len(versions) else None
        active_from = pv.created_at
        active_until = next_pv.created_at if next_pv else None

        runs_in_window = [
            r
            for r in runs
            if r.created_at >= active_from
            and (active_until is None or r.created_at < active_until)
        ]
        scored = [r.score for r in runs_in_window if r.score is not None]
        avg_score = round(sum(scored) / len(scored), 2) if scored else None

        # Pull the eval that produced this version (if any) for the weakness label
        weakness = None
        if pv.parent_eval_id is not None:
            ev = session.get(EvalResult, pv.parent_eval_id)
            weakness = ev.weakness if ev else None

        out.append(
            {
                "id": pv.id,
                "version": pv.version,
                "prompt": pv.prompt,
                "diff_from_previous": _diff_lines(prev_prompt, pv.prompt) if i > 0 else [],
                "parent_eval_id": pv.parent_eval_id,
                "weakness": weakness,
                "active_from": active_from.isoformat(),
                "active_until": active_until.isoformat() if active_until else None,
                "is_current": pv.version == agent.version,
                "runs": [
                    {
                        "id": r.id,
                        "score": r.score,
                        "status": r.status,
                        "created_at": r.created_at.isoformat(),
                    }
                    for r in runs_in_window
                ],
                "avg_score": avg_score,
                "run_count": len(runs_in_window),
            }
        )
    return out


@router.post("/{agent_id}/revert-to/{version_id}")
def revert_to(
    agent_id: int, version_id: int, session: Session = Depends(get_session)
) -> dict:
    """Forward-only revert: creates a new PromptVersion that copies the prompt
    of the chosen version. Bumps Agent.version. History is preserved."""
    agent = session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    target = session.get(PromptVersion, version_id)
    if not target or target.agent_id != agent_id:
        raise HTTPException(404, "Prompt version not found for this agent")
    if target.version == agent.version:
        raise HTTPException(409, "That version is already current")

    new_version = agent.version + 1
    agent.system_prompt = target.prompt
    agent.version = new_version
    session.add(agent)

    pv = PromptVersion(
        agent_id=agent.id,
        agent_name=agent.name,
        version=new_version,
        prompt=target.prompt,
        parent_eval_id=None,
    )
    session.add(pv)
    session.commit()
    session.refresh(pv)

    return {
        "agent_id": agent.id,
        "reverted_to_version": target.version,
        "new_version": new_version,
        "prompt_version_id": pv.id,
    }
