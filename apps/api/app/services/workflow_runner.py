"""Chain the six agents end-to-end and persist a full AgentRun."""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from ..models import Agent, AgentRun
from ..tools.data_tools import compliance_check
from .agent_runner import run_agent
from .evaluation import parse_and_persist_eval
from .llm_client import MiniMaxClient

WORKFLOW_ORDER = [
    "Campaign Analyst",
    "Risk & Profitability",
    "Segment Discovery",
    "Marketing Strategist",
    "Compliance Reviewer",
    "QA Evaluator",
]


def _load_agents(session: Session) -> dict[str, Agent]:
    rows = session.exec(select(Agent).where(Agent.enabled == True)).all()  # noqa: E712
    return {a.name: a for a in rows}


def _extract_score(text: str) -> float | None:
    """QA agent's prose includes a score 0-10 — pull the first sensible number."""
    m = re.search(r"\b(?:score|overall)[^0-9]{0,12}(\d+(?:\.\d+)?)\s*/\s*10", text, re.I)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    m = re.search(r"\b(\d+(?:\.\d+)?)\s*/\s*10\b", text)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None


def run_workflow(
    session: Session,
    user_question: str,
    workflow_name: str = "campaign-recommendation",
    llm: MiniMaxClient | None = None,
    existing_run: AgentRun | None = None,
) -> AgentRun:
    llm = llm or MiniMaxClient()

    if existing_run is not None:
        run = existing_run
        run.status = "running"
        session.add(run)
        session.commit()
        session.refresh(run)
    else:
        run = AgentRun(
            workflow_name=workflow_name,
            user_question=user_question,
            status="running",
        )
        session.add(run)
        session.commit()
        session.refresh(run)

    agents_by_name = _load_agents(session)
    prior_outputs: list[dict[str, str]] = []
    final_strategist: str = ""

    try:
        for step_order, agent_name in enumerate(WORKFLOW_ORDER, start=1):
            agent = agents_by_name.get(agent_name)
            if not agent:
                continue

            extra: dict[str, Any] = {}
            if agent_name == "Compliance Reviewer" and final_strategist:
                # Pre-run the regex compliance pass so the agent has structured findings.
                extra["compliance_check"] = compliance_check(session, text=final_strategist)

            step = run_agent(
                session=session,
                run_id=run.id,
                agent=agent,
                step_order=step_order,
                user_question=user_question,
                prior_outputs=prior_outputs,
                llm=llm,
                extra_tool_input=extra or None,
            )

            output_text = step.output.get("text", "") if isinstance(step.output, dict) else ""
            prior_outputs.append({"agent": agent.name, "output": output_text})

            if agent_name == "Marketing Strategist":
                final_strategist = output_text

        # Final answer = strategist text. Persist structured eval + overall score.
        qa_text = next(
            (p["output"] for p in prior_outputs if p["agent"] == "QA Evaluator"), ""
        )
        run.final_answer = final_strategist or (
            prior_outputs[-1]["output"] if prior_outputs else ""
        )

        eval_row = parse_and_persist_eval(session, run.id, qa_text)
        run.score = eval_row.overall_score
        if run.score is None:
            # Fallback to the legacy regex if the JSON couldn't be parsed.
            run.score = _extract_score(qa_text)

        run.status = "completed"
        run.completed_at = datetime.utcnow()
    except Exception as exc:  # noqa: BLE001
        run.status = "failed"
        run.final_answer = f"[workflow error] {type(exc).__name__}: {exc}"
        run.completed_at = datetime.utcnow()

    session.add(run)
    session.commit()
    session.refresh(run)
    return run
