from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..models import AgentRun, Campaign, Customer, EvalResult, Policy, RunInsight

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def summary(session: Session = Depends(get_session)) -> dict:
    total_runs = session.exec(select(func.count(AgentRun.id))).one()
    avg_score = session.exec(select(func.avg(EvalResult.overall_score))).one()
    open_recs = session.exec(
        select(func.count(EvalResult.id)).where(
            EvalResult.suggested_patch.is_not(None),  # type: ignore[union-attr]
            EvalResult.patch_applied == False,  # noqa: E712
        )
    ).one()

    # Best campaign by margin, worst by expected loss ratio
    rows = session.exec(
        select(
            Campaign.id,
            Campaign.name,
            Campaign.spend_zar,
            func.coalesce(func.sum(Policy.margin_zar), 0.0),
            func.coalesce(func.sum(Policy.expected_loss_zar), 0.0),
            func.coalesce(func.sum(Policy.premium_zar), 0.0),
        )
        .select_from(Campaign)
        .join(Customer, Customer.source_campaign_id == Campaign.id, isouter=True)
        .join(Policy, Policy.customer_id == Customer.id, isouter=True)
        .group_by(Campaign.id, Campaign.name, Campaign.spend_zar)
    ).all()

    best = None
    worst = None
    for cid, name, spend, margin, loss, premium in rows:
        loss_ratio = (loss / premium) if premium else 0.0
        entry = {
            "id": cid,
            "name": name,
            "spend_zar": float(spend),
            "sum_margin_zar": float(margin),
            "sum_expected_loss_zar": float(loss),
            "loss_ratio": round(loss_ratio, 3),
        }
        if best is None or entry["sum_margin_zar"] > best["sum_margin_zar"]:
            best = entry
        if worst is None or entry["loss_ratio"] > worst["loss_ratio"]:
            worst = entry

    # Eval trajectory — last 12 evals (oldest → newest) for sparkline
    trajectory_rows = session.exec(
        select(EvalResult.run_id, EvalResult.overall_score, EvalResult.created_at)
        .where(EvalResult.overall_score.is_not(None))  # type: ignore[union-attr]
        .order_by(EvalResult.created_at.desc())
        .limit(12)
    ).all()
    trajectory = [
        {
            "run_id": r[0],
            "score": float(r[1]) if r[1] is not None else None,
            "at": r[2].isoformat(),
        }
        for r in reversed(trajectory_rows)
    ]

    # Recent runs (last 5) with quick metadata
    recent_runs = session.exec(
        select(AgentRun).order_by(AgentRun.created_at.desc()).limit(5)
    ).all()
    recent = [
        {
            "id": r.id,
            "user_question": r.user_question,
            "status": r.status,
            "score": r.score,
            "created_at": r.created_at.isoformat(),
        }
        for r in recent_runs
    ]

    # Latest insight (if any) for dashboard hero
    latest_insight_row = session.exec(
        select(RunInsight, AgentRun)
        .join(AgentRun, AgentRun.id == RunInsight.run_id)
        .order_by(RunInsight.created_at.desc())
        .limit(1)
    ).first()
    latest_insight = None
    if latest_insight_row:
        ins, run = latest_insight_row
        latest_insight = {
            "run_id": ins.run_id,
            "headline": ins.headline,
            "tldr": ins.tldr,
            "score": run.score,
            "user_question": run.user_question,
            "created_at": ins.created_at.isoformat(),
        }

    return {
        "total_agent_runs": int(total_runs or 0),
        "average_eval_score": float(avg_score) if avg_score is not None else None,
        "open_recommendations": int(open_recs or 0),
        "best_campaign_by_margin": best,
        "worst_campaign_by_loss_ratio": worst,
        "eval_trajectory": trajectory,
        "recent_runs": recent,
        "latest_insight": latest_insight,
    }
