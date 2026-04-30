from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Agent, AgentRun, EvalResult, PromptVersion
from ..services.evaluation import parse_qa_text

router = APIRouter(prefix="/evals", tags=["evals"])


@router.get("")
def list_evals(session: Session = Depends(get_session)) -> list[dict]:
    rows = session.exec(
        select(EvalResult, AgentRun)
        .join(AgentRun, AgentRun.id == EvalResult.run_id)
        .order_by(EvalResult.created_at.desc())
    ).all()
    out = []
    for ev, run in rows:
        out.append({**ev.model_dump(), "run": run.model_dump()})
    return out


@router.get("/runs/{run_id}")
def eval_for_run(run_id: int, session: Session = Depends(get_session)) -> EvalResult:
    ev = session.exec(select(EvalResult).where(EvalResult.run_id == run_id)).first()
    if not ev:
        raise HTTPException(404, "No eval for that run")
    return ev


@router.post("/{eval_id}/re-evaluate")
def re_evaluate(eval_id: int, session: Session = Depends(get_session)) -> EvalResult:
    """Re-parse an eval's stored raw QA text. Useful when the model returned
    prose instead of JSON the first time around."""
    ev = session.get(EvalResult, eval_id)
    if not ev:
        raise HTTPException(404, "Eval not found")
    if not ev.raw_qa_text:
        raise HTTPException(400, "No stored QA text to re-parse")

    parsed = parse_qa_text(ev.raw_qa_text)
    if not parsed:
        raise HTTPException(422, "Could not extract JSON from QA text")

    def _f(v):
        try:
            return max(0.0, min(10.0, float(v))) if v is not None else None
        except (TypeError, ValueError):
            return None

    ev.accuracy_score = _f(parsed.get("accuracy"))
    ev.evidence_score = _f(parsed.get("evidence"))
    ev.usefulness_score = _f(parsed.get("usefulness"))
    ev.compliance_score = _f(parsed.get("compliance"))
    dims = [s for s in (ev.accuracy_score, ev.evidence_score, ev.usefulness_score, ev.compliance_score) if s is not None]
    ev.overall_score = round(sum(dims) / len(dims), 2) if dims else None
    w = parsed.get("weakness")
    t = parsed.get("patch_target_agent")
    p = parsed.get("patch")
    ev.weakness = w if isinstance(w, str) else ev.weakness
    ev.suggested_patch_target_agent = t if isinstance(t, str) else ev.suggested_patch_target_agent
    ev.suggested_patch = p if isinstance(p, str) else ev.suggested_patch
    session.add(ev)

    # Also update the run's overall score if we recovered one
    run = session.get(AgentRun, ev.run_id)
    if run and ev.overall_score is not None:
        run.score = ev.overall_score
        session.add(run)

    session.commit()
    session.refresh(ev)
    return ev


@router.post("/{eval_id}/apply-patch")
def apply_patch(eval_id: int, session: Session = Depends(get_session)) -> dict:
    """Accept the QA's suggested patch: append to target agent's system prompt,
    bump version, store a PromptVersion row pointing back to this eval."""
    ev = session.get(EvalResult, eval_id)
    if not ev:
        raise HTTPException(404, "Eval not found")
    if ev.patch_applied:
        raise HTTPException(409, "Patch already applied")
    if not ev.suggested_patch or not ev.suggested_patch_target_agent:
        raise HTTPException(400, "No patch to apply")

    agent = session.exec(
        select(Agent).where(Agent.name == ev.suggested_patch_target_agent)
    ).first()
    if not agent:
        raise HTTPException(404, f"Target agent {ev.suggested_patch_target_agent!r} not found")

    new_version = agent.version + 1
    new_prompt = agent.system_prompt.rstrip() + "\n\n" + ev.suggested_patch.strip()
    agent.system_prompt = new_prompt
    agent.version = new_version
    session.add(agent)

    pv = PromptVersion(
        agent_id=agent.id,
        agent_name=agent.name,
        version=new_version,
        prompt=new_prompt,
        parent_eval_id=ev.id,
    )
    session.add(pv)

    ev.patch_applied = True
    session.add(ev)
    session.commit()
    session.refresh(agent)
    session.refresh(pv)

    return {
        "agent_id": agent.id,
        "agent_name": agent.name,
        "new_version": new_version,
        "prompt_version_id": pv.id,
    }


@router.get("/agents/{agent_id}/prompt-versions")
def prompt_versions(
    agent_id: int, session: Session = Depends(get_session)
) -> list[PromptVersion]:
    return list(
        session.exec(
            select(PromptVersion)
            .where(PromptVersion.agent_id == agent_id)
            .order_by(PromptVersion.version.desc())
        ).all()
    )
