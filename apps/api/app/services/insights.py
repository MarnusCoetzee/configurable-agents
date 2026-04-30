"""Generate executive-summary insights from a run's final answer."""

from __future__ import annotations

import json
import re
import time
from typing import Any, Optional

from sqlmodel import Session, select

from ..models import AgentRun, InsightMessage, RunInsight
from .llm_client import MiniMaxClient


_INSIGHT_SYSTEM = """You are a marketing executive briefing writer.
Given a long agent recommendation, produce a tight executive summary as a single JSON object.
Output ONLY the JSON object, starting with { and ending with }. No prose, no fences.

Schema:
{
  "headline": "<5-10 word headline capturing the core decision>",
  "tldr": "<1-2 sentence executive summary, plain prose>",
  "key_actions": [
    {"action": "<imperative verb phrase>", "rationale": "<one short sentence with a number>", "metric": "<one key metric e.g. 'ROAS 495' or 'Loss ratio 32%'>"}
  ],
  "watch_outs": [
    {"risk": "<one short sentence>", "mitigation": "<one short sentence>"}
  ],
  "key_metrics": [
    {"label": "<short label>", "value": "<formatted value e.g. 'R7,938 / policy'>"}
  ]
}

Aim for 3-5 key actions, 1-3 watch_outs, 4-6 key_metrics. Be specific and numerical."""


_JSON_OBJ = re.compile(r"\{[\s\S]*\}")


def _extract_json(text: str) -> Optional[dict[str, Any]]:
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text, re.IGNORECASE)
    candidate = fenced.group(1) if fenced else None
    if not candidate:
        m = _JSON_OBJ.search(text)
        if not m:
            return None
        candidate = m.group(0)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def get_or_create_insight(
    session: Session,
    run: AgentRun,
    llm: MiniMaxClient | None = None,
    force: bool = False,
) -> RunInsight:
    existing = session.exec(
        select(RunInsight).where(RunInsight.run_id == run.id)
    ).first()
    if existing and not force:
        return existing

    llm = llm or MiniMaxClient()

    user_msg = (
        f"User question: {run.user_question}\n\n"
        f"Final agent recommendation:\n{run.final_answer or ''}"
    )

    resp = llm.chat(
        messages=[
            {"role": "system", "content": _INSIGHT_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.2,
        max_tokens=2048,
        json_mode=True,
    )
    parsed = _extract_json(resp.content) or {}

    def _list(v: Any) -> list[dict[str, Any]]:
        return v if isinstance(v, list) else []

    if existing:
        insight = existing
    else:
        insight = RunInsight(run_id=run.id)

    insight.headline = parsed.get("headline") if isinstance(parsed.get("headline"), str) else None
    insight.tldr = parsed.get("tldr") if isinstance(parsed.get("tldr"), str) else None
    insight.key_actions = _list(parsed.get("key_actions"))
    insight.watch_outs = _list(parsed.get("watch_outs"))
    insight.key_metrics = _list(parsed.get("key_metrics"))
    insight.raw_json = parsed

    session.add(insight)
    session.commit()
    session.refresh(insight)
    return insight


# ---- Chat ---------------------------------------------------------------

_CHAT_SYSTEM_TEMPLATE = """You are an analyst answering follow-up questions about a marketing recommendation.

Original question: {question}

Full recommendation:
{recommendation}

Executive summary:
{summary}

Answer the user's questions concisely (2-4 sentences unless they ask for detail).
Cite specific numbers from the recommendation. If the answer isn't supported by the
recommendation, say so honestly rather than inventing facts. Use plain prose, no markdown headers."""


def chat_followup(
    session: Session,
    run: AgentRun,
    user_message: str,
    llm: MiniMaxClient | None = None,
) -> InsightMessage:
    llm = llm or MiniMaxClient()
    insight = session.exec(select(RunInsight).where(RunInsight.run_id == run.id)).first()
    summary_text = (
        f"Headline: {insight.headline}\nTL;DR: {insight.tldr}" if insight else "(not yet generated)"
    )
    system = _CHAT_SYSTEM_TEMPLATE.format(
        question=run.user_question,
        recommendation=run.final_answer or "",
        summary=summary_text,
    )

    history = list(
        session.exec(
            select(InsightMessage)
            .where(InsightMessage.run_id == run.id)
            .order_by(InsightMessage.created_at)
        ).all()
    )

    # Persist the user message immediately
    user_row = InsightMessage(run_id=run.id, role="user", content=user_message)
    session.add(user_row)
    session.commit()

    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for m in history:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": user_message})

    started = time.perf_counter()
    try:
        resp = llm.chat(messages=messages, temperature=0.3, max_tokens=2048)
        answer = resp.content or "(empty response)"
        tokens = resp.tokens_used
    except Exception as exc:  # noqa: BLE001
        answer = f"[error] {type(exc).__name__}: {exc}"
        tokens = 0
    latency = int((time.perf_counter() - started) * 1000)

    asst = InsightMessage(
        run_id=run.id,
        role="assistant",
        content=answer,
        tokens_used=tokens,
        latency_ms=latency,
    )
    session.add(asst)
    session.commit()
    session.refresh(asst)
    return asst
