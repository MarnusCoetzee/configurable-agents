from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..models import Campaign, Customer, Policy

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("")
def list_campaigns(session: Session = Depends(get_session)) -> list[dict]:
    rows = session.exec(select(Campaign).order_by(Campaign.id)).all()
    out = []
    for c in rows:
        # Aggregate from policies linked via customers.source_campaign_id
        agg = session.exec(
            select(
                func.coalesce(func.sum(Policy.premium_zar), 0.0),
                func.coalesce(func.sum(Policy.expected_loss_zar), 0.0),
                func.coalesce(func.sum(Policy.margin_zar), 0.0),
                func.count(Policy.id),
            )
            .select_from(Policy)
            .join(Customer, Customer.id == Policy.customer_id)
            .where(Customer.source_campaign_id == c.id)
        ).one()
        sum_premium, sum_loss, sum_margin, policy_count = agg
        cpl = (c.spend_zar / c.leads) if c.leads else 0.0
        cpp = (c.spend_zar / c.policies) if c.policies else 0.0
        roas = (sum_margin / c.spend_zar) if c.spend_zar else 0.0
        out.append(
            {
                **c.model_dump(),
                "policies_observed": int(policy_count),
                "sum_premium_zar": float(sum_premium),
                "sum_expected_loss_zar": float(sum_loss),
                "sum_margin_zar": float(sum_margin),
                "cost_per_lead_zar": round(cpl, 2),
                "cost_per_policy_zar": round(cpp, 2),
                "risk_adjusted_roas": round(roas, 3),
            }
        )
    return out
