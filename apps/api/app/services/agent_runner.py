"""Run a single agent: build messages, call MiniMax, persist an AgentStep."""

from __future__ import annotations

import json
import time
from typing import Any

from sqlmodel import Session

from ..models import Agent, AgentStep
from ..tools import run_tool
from .llm_client import MiniMaxClient


def _gather_tool_context(session: Session, agent: Agent) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Run each known tool the agent has and return (tool_calls, combined_data)."""
    calls: list[dict[str, Any]] = []
    data: dict[str, Any] = {}
    for tool_name in agent.tools:
        if tool_name not in {
            "get_campaign_metrics",
            "compare_campaigns",
            "query_postgres",
            "get_policy_margin",
            "get_expected_loss_by_segment",
            "segment_customers",
            "rank_segments",
        }:
            continue
        result = run_tool(tool_name, session)
        if result is None:
            continue
        calls.append({"tool": tool_name, "result_summary": _summarize(result)})
        data[tool_name] = result
    return calls, data


def _summarize(result: dict[str, Any]) -> str:
    """A tiny preview so the timeline UI has something readable."""
    if isinstance(result, dict):
        for k, v in result.items():
            if isinstance(v, list):
                return f"{k}: {len(v)} rows"
    return "ok"


def _build_messages(
    agent: Agent,
    user_question: str,
    prior_outputs: list[dict[str, str]],
    tool_data: dict[str, Any],
) -> list[dict[str, str]]:
    msgs: list[dict[str, str]] = [{"role": "system", "content": agent.system_prompt}]

    user_parts = [f"User question: {user_question}"]

    if prior_outputs:
        user_parts.append("\nPrior agent outputs:")
        for prev in prior_outputs:
            user_parts.append(f"\n--- {prev['agent']} ---\n{prev['output']}")

    if tool_data:
        user_parts.append("\nTool data (pre-fetched for you):")
        user_parts.append(json.dumps(tool_data, indent=2)[:6000])

    user_parts.append(f"\nYour role: {agent.goal}")
    user_parts.append(
        "\nRespond concisely. Cite specific numbers from the tool data. "
        "Do not invent facts. Use plain prose, no markdown headers."
    )

    msgs.append({"role": "user", "content": "\n".join(user_parts)})
    return msgs


def run_agent(
    session: Session,
    run_id: int,
    agent: Agent,
    step_order: int,
    user_question: str,
    prior_outputs: list[dict[str, str]],
    llm: MiniMaxClient,
    extra_tool_input: dict[str, Any] | None = None,
) -> AgentStep:
    """Execute one agent and persist its step."""
    started = time.perf_counter()

    tool_calls, tool_data = _gather_tool_context(session, agent)
    if extra_tool_input:
        tool_data.update(extra_tool_input)

    messages = _build_messages(agent, user_question, prior_outputs, tool_data)

    output_text = ""
    reasoning = ""
    finish_reason: str | None = None
    tokens = 0
    try:
        resp = llm.chat(
            messages=messages,
            temperature=agent.temperature,
            max_tokens=8192,
            model=agent.model,
            json_mode=(agent.role == "evaluator"),
        )
        output_text = resp.content or "(empty response)"
        reasoning = resp.reasoning
        finish_reason = resp.finish_reason
        tokens = resp.tokens_used
    except Exception as exc:  # noqa: BLE001
        output_text = f"[error] {type(exc).__name__}: {exc}"

    latency_ms = int((time.perf_counter() - started) * 1000)

    step = AgentStep(
        run_id=run_id,
        agent_id=agent.id,
        agent_name=agent.name,
        step_order=step_order,
        input={"question": user_question, "prior_count": len(prior_outputs)},
        output={
            "text": output_text,
            "reasoning": reasoning,
            "finish_reason": finish_reason,
        },
        tool_calls=tool_calls,
        latency_ms=latency_ms,
        tokens_used=tokens,
    )
    session.add(step)
    session.commit()
    session.refresh(step)
    return step
