"""Postgres-backed tool implementations.

Each function takes a SQLModel `Session` and returns a JSON-serializable dict
that the workflow runner inlines into the agent's message context.
"""

from __future__ import annotations

import re

from sqlalchemy import func
from sqlmodel import Session, select

from ..models import Campaign, Customer, Policy


def get_campaign_metrics(session: Session) -> dict:
    """Marketing + profitability metrics per campaign."""
    rows = session.exec(
        select(
            Campaign.id,
            Campaign.name,
            Campaign.channel,
            Campaign.spend_zar,
            Campaign.leads,
            Campaign.quotes,
            Campaign.policies,
            Campaign.acquisition_cost_zar,
            func.coalesce(func.sum(Policy.premium_zar), 0.0),
            func.coalesce(func.sum(Policy.expected_loss_zar), 0.0),
            func.coalesce(func.sum(Policy.margin_zar), 0.0),
        )
        .select_from(Campaign)
        .join(Customer, Customer.source_campaign_id == Campaign.id, isouter=True)
        .join(Policy, Policy.customer_id == Customer.id, isouter=True)
        .group_by(
            Campaign.id,
            Campaign.name,
            Campaign.channel,
            Campaign.spend_zar,
            Campaign.leads,
            Campaign.quotes,
            Campaign.policies,
            Campaign.acquisition_cost_zar,
        )
        .order_by(Campaign.id)
    ).all()

    out = []
    for r in rows:
        cid, name, channel, spend, leads, quotes, policies, cac, premium, loss, margin = r
        loss_ratio = (float(loss) / float(premium)) if premium else 0.0
        roas = (float(margin) / float(spend)) if spend else 0.0
        out.append(
            {
                "id": cid,
                "name": name,
                "channel": channel,
                "spend_zar": round(float(spend), 0),
                "leads": int(leads),
                "quotes": int(quotes),
                "policies": int(policies),
                "cost_per_policy_zar": round(float(cac), 0),
                "premium_zar": round(float(premium), 0),
                "expected_loss_zar": round(float(loss), 0),
                "margin_zar": round(float(margin), 0),
                "loss_ratio": round(loss_ratio, 3),
                "risk_adjusted_roas": round(roas, 3),
            }
        )
    return {"campaigns": out}


def get_policy_margin_by_campaign(session: Session) -> dict:
    """Tighter view focused on profitability — what the Risk agent needs."""
    rows = session.exec(
        select(
            Campaign.name,
            func.coalesce(func.avg(Policy.premium_zar), 0.0),
            func.coalesce(func.avg(Policy.expected_loss_zar), 0.0),
            func.coalesce(func.avg(Policy.margin_zar), 0.0),
            func.count(Policy.id),
        )
        .select_from(Campaign)
        .join(Customer, Customer.source_campaign_id == Campaign.id, isouter=True)
        .join(Policy, Policy.customer_id == Customer.id, isouter=True)
        .group_by(Campaign.name)
        .order_by(func.avg(Policy.margin_zar).desc())
    ).all()

    return {
        "by_campaign": [
            {
                "campaign": name,
                "policies": int(n),
                "avg_premium_zar": round(float(prem), 0),
                "avg_expected_loss_zar": round(float(loss), 0),
                "avg_margin_zar": round(float(margin), 0),
                "loss_ratio": round(float(loss) / float(prem), 3) if prem else 0.0,
            }
            for name, prem, loss, margin, n in rows
        ]
    }


def rank_segments(session: Session) -> dict:
    """Segments ranked by avg margin — what Segment Discovery uses."""
    rows = session.exec(
        select(
            Customer.province,
            Customer.age_band,
            Customer.product_type,
            Customer.risk_band,
            func.count(Policy.id),
            func.coalesce(func.avg(Policy.premium_zar), 0.0),
            func.coalesce(func.avg(Policy.margin_zar), 0.0),
            func.coalesce(func.avg(Policy.expected_loss_zar), 0.0),
        )
        .select_from(Customer)
        .join(Policy, Policy.customer_id == Customer.id)
        .group_by(
            Customer.province,
            Customer.age_band,
            Customer.product_type,
            Customer.risk_band,
        )
        .having(func.count(Policy.id) >= 25)
        .order_by(func.avg(Policy.margin_zar).desc())
        .limit(20)
    ).all()

    return {
        "top_segments": [
            {
                "province": prov,
                "age_band": age,
                "product_type": prod,
                "risk_band": risk,
                "policies": int(n),
                "avg_premium_zar": round(float(prem), 0),
                "avg_margin_zar": round(float(margin), 0),
                "avg_expected_loss_zar": round(float(loss), 0),
            }
            for prov, age, prod, risk, n, prem, margin, loss in rows
        ]
    }


# ---- Compliance ---------------------------------------------------------

_RISKY_PATTERNS = [
    (r"\bguaranteed?\b", "Avoid 'guaranteed' — implies certainty insurers cannot claim."),
    (r"\bsave (up to )?\d+%", "Savings claims need a disclaimer and substantiation."),
    (r"\bcheapest\b", "'Cheapest' is an absolute claim — soften (e.g. 'competitive')."),
    (r"\balways\b", "Avoid 'always' in policy language."),
    (r"\bno (risk|catch)\b", "'No risk/catch' is a regulated phrase to avoid."),
    (r"\bbest price\b", "'Best price' is an absolute claim."),
]


def compliance_check(session: Session, text: str = "") -> dict:
    findings = []
    for pat, msg in _RISKY_PATTERNS:
        for m in re.finditer(pat, text, flags=re.IGNORECASE):
            findings.append({"phrase": m.group(0), "issue": msg, "offset": m.start()})
    return {
        "ok": len(findings) == 0,
        "findings": findings,
        "checked_chars": len(text),
    }
