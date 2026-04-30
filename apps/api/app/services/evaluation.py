"""Parse the QA evaluator's JSON output and persist an EvalResult row.

If the QA agent ignored the JSON contract and returned prose, we run one
small recovery LLM call that converts the prose into the expected schema.
"""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from sqlmodel import Session

from ..models import EvalResult
from .llm_client import MiniMaxClient


_JSON_OBJ = re.compile(r"\{[\s\S]*\}")


def _extract_json(text: str) -> Optional[dict[str, Any]]:
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text, re.IGNORECASE)
    if fenced:
        candidate = fenced.group(1)
    else:
        match = _JSON_OBJ.search(text)
        if not match:
            return None
        candidate = match.group(0)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def _recover_with_llm(prose: str, llm: MiniMaxClient) -> Optional[dict[str, Any]]:
    """Last-resort: ask the LLM to reformat the prose evaluation as JSON."""
    if not prose.strip():
        return None
    prompt = (
        "Convert the following evaluation into a single JSON object with fields "
        "accuracy, evidence, usefulness, compliance (all numbers 0-10), weakness "
        "(string), patch_target_agent (string — one of: Campaign Analyst, "
        "Risk & Profitability, Segment Discovery, Marketing Strategist, "
        "Compliance Reviewer), patch (string). Output ONLY the JSON object, "
        "starting with { and ending with }. No prose, no fences.\n\n"
        f"Evaluation:\n{prose}"
    )
    try:
        resp = llm.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=1024,
            json_mode=True,
        )
    except Exception:
        return None
    return _extract_json(resp.content)


def _to_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return max(0.0, min(10.0, float(v)))
    except (TypeError, ValueError):
        return None


def parse_qa_text(qa_text: str, llm: MiniMaxClient | None = None) -> dict[str, Any]:
    """Best-effort parse: native JSON first, then LLM recovery."""
    parsed = _extract_json(qa_text)
    if parsed is None and qa_text.strip():
        parsed = _recover_with_llm(qa_text, llm or MiniMaxClient())
    return parsed or {}


def parse_and_persist_eval(session: Session, run_id: int, qa_text: str) -> EvalResult:
    parsed = parse_qa_text(qa_text)

    accuracy = _to_float(parsed.get("accuracy"))
    evidence = _to_float(parsed.get("evidence"))
    usefulness = _to_float(parsed.get("usefulness"))
    compliance = _to_float(parsed.get("compliance"))

    dims = [s for s in (accuracy, evidence, usefulness, compliance) if s is not None]
    overall = round(sum(dims) / len(dims), 2) if dims else None

    weakness = parsed.get("weakness")
    target = parsed.get("patch_target_agent")
    patch = parsed.get("patch")

    eval_row = EvalResult(
        run_id=run_id,
        accuracy_score=accuracy,
        usefulness_score=usefulness,
        compliance_score=compliance,
        evidence_score=evidence,
        overall_score=overall,
        weakness=weakness if isinstance(weakness, str) else None,
        suggested_patch_target_agent=target if isinstance(target, str) else None,
        suggested_patch=patch if isinstance(patch, str) else None,
        raw_qa_text=qa_text[:8000],
    )
    session.add(eval_row)
    session.commit()
    session.refresh(eval_row)
    return eval_row
