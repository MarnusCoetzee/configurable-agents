"""Seed AcmeSure Auto & Home Insurance demo data.

Runnable as: `python -m app.seed.generate_fake_data` from inside the api
container, or `docker compose exec api python -m app.seed.generate_fake_data`.

Bakes in a non-obvious insight so agents have something real to discover:

- Facebook Young Drivers: cheap leads, poor margin, high expected loss.
- Google Search Auto: pricier leads, decent conversion, medium margin.
- Referral Bundle: low volume, BEST margin, lowest expected loss.
- Email Home Renewal: cheap, stable, high conversion, limited scale.
- TikTok First-Time Owners: viral but unprofitable.
- LinkedIn SMB: niche but high premium.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta

from sqlmodel import Session, select

from ..db import engine, init_db
from ..models import (
    Agent,
    Campaign,
    Claim,
    Customer,
    Policy,
)


# ---- Campaign archetypes -----------------------------------------------

CAMPAIGN_PROFILES = [
    # name, channel, spend, lead_volume_factor, conversion_rate, avg_premium, expected_loss_rate
    #
    # The seed bakes in deliberate patterns so agents have something real to discover:
    #   - cheap leads aren't profitable (Facebook Young Drivers, TikTok, Snapchat)
    #   - small "hidden gem" channels with elite unit economics (WhatsApp, Direct Mail,
    #     Affiliate, Email, Referral)
    #   - looks-bad-on-direct-attribution but defensible (Podcast, Display)
    #   - aggregators that scale but at thin margins (Comparison Site)
    #   - high-premium niches (LinkedIn SMB)

    # ---- Search ---------------------------------------------------------
    ("Google Search: Auto Insurance", "Search", 180_000, 1.0, 0.18, 6_800, 0.55),
    ("Google Search: Home Insurance", "Search", 95_000, 0.7, 0.20, 8_200, 0.48),
    ("Google Search: Bundle Quote", "Search", 65_000, 0.5, 0.24, 10_400, 0.44),
    ("Bing Search: Auto Insurance", "Search", 28_000, 0.3, 0.16, 6_500, 0.58),

    # ---- Paid Social — high volume, high risk --------------------------
    ("Facebook: Young Drivers", "Paid Social", 220_000, 1.6, 0.10, 4_200, 0.85),
    ("Facebook: Home Cover Retargeting", "Paid Social", 70_000, 0.6, 0.16, 6_900, 0.52),
    ("Instagram: Lifestyle Auto", "Paid Social", 85_000, 0.9, 0.09, 5_400, 0.72),
    ("TikTok: First-Time Car Owners", "Paid Social", 120_000, 1.4, 0.07, 3_600, 0.92),
    ("Snapchat: Student Drivers", "Paid Social", 45_000, 1.3, 0.05, 3_800, 0.95),
    ("LinkedIn: Small Business Cover", "Paid Social", 60_000, 0.4, 0.22, 14_000, 0.45),

    # ---- Video / Audio --------------------------------------------------
    ("YouTube Pre-Roll: Home Cover", "Video", 75_000, 0.9, 0.06, 5_200, 0.58),
    ("Podcast: Daily Drive Sponsorship", "Audio", 50_000, 0.2, 0.04, 9_500, 0.50),

    # ---- Owned + low-cost channels (the hidden gems) -------------------
    ("Email: Home Insurance Renewal", "Email", 15_000, 0.6, 0.42, 7_500, 0.40),
    ("Email: Cross-Sell Existing Auto", "Email", 12_000, 0.5, 0.38, 9_800, 0.36),
    ("WhatsApp Opt-In: Renewal Reminders", "Messaging", 8_000, 0.4, 0.48, 7_200, 0.38),
    ("Direct Mail: Existing Customers", "Direct Mail", 22_000, 0.3, 0.50, 8_500, 0.36),
    ("Referral: Bundle Discount", "Referral", 25_000, 0.3, 0.55, 11_500, 0.32),
    ("Referral: Broker Network", "Referral", 40_000, 0.4, 0.48, 12_800, 0.38),

    # ---- Aggregators / Affiliate ---------------------------------------
    ("Comparison Site: Hippo Aggregator", "Aggregator", 140_000, 1.1, 0.12, 5_900, 0.62),
    ("Comparison Site: King Price Aggregator", "Aggregator", 95_000, 0.9, 0.13, 5_700, 0.60),
    ("Affiliate: FinTech Marketplace", "Affiliate", 30_000, 0.5, 0.28, 10_500, 0.42),

    # ---- Display / Brand -----------------------------------------------
    ("Display: Brand Awareness", "Display", 90_000, 0.8, 0.05, 5_500, 0.65),
    ("Out-of-Home: Highway Billboards", "OOH", 60_000, 0.4, 0.03, 6_100, 0.55),
]

PROVINCES = [
    "Gauteng",
    "Western Cape",
    "KwaZulu-Natal",
    "Eastern Cape",
    "Free State",
    "Mpumalanga",
]
AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55+"]
PRODUCTS = ["Auto", "Home", "Bundle", "Small Business"]
RISK_BANDS = ["Low", "Medium", "High"]
CLAIM_TYPES = ["Collision", "Theft", "Weather", "Liability", "Fire"]


# ---- Default agent configs --------------------------------------------

DEFAULT_AGENTS = [
    {
        "name": "Campaign Analyst",
        "role": "analyst",
        "goal": "Analyze marketing campaign performance using spend, leads, quotes, policies and conversion metrics.",
        "system_prompt": (
            "You are a senior marketing analyst at an insurer. "
            "Use campaign metrics to identify which campaigns are performing well or poorly. "
            "Always cite specific numbers and tables. Be concise."
        ),
        "tools": ["get_campaign_metrics", "compare_campaigns", "query_postgres"],
        "temperature": 0.2,
    },
    {
        "name": "Risk & Profitability",
        "role": "actuarial",
        "goal": "Evaluate whether acquired customers are profitable after expected losses and risk bands.",
        "system_prompt": (
            "You are an actuarial-minded analyst. Given campaign and policy data, "
            "decide whether the customers a campaign produces are PROFITABLE — not just cheap. "
            "Consider expected loss, margin, and risk band. Cite numbers."
        ),
        "tools": ["get_policy_margin", "get_expected_loss_by_segment", "query_postgres"],
        "temperature": 0.2,
    },
    {
        "name": "Segment Discovery",
        "role": "analyst",
        "goal": "Find customer segments with strong conversion, low expected loss and high premium value.",
        "system_prompt": (
            "You discover high-value customer segments by combining province, age band, "
            "product type and risk band. Rank segments by risk-adjusted margin."
        ),
        "tools": ["segment_customers", "rank_segments", "query_postgres"],
        "temperature": 0.3,
    },
    {
        "name": "Marketing Strategist",
        "role": "strategist",
        "goal": "Turn analysis into campaign recommendations, budget shifts and test ideas.",
        "system_prompt": (
            "You receive analysis from the Analyst, Risk and Segment agents. "
            "Recommend specific budget moves, audiences to test and creative angles. "
            "Cite at least two campaign metrics and one profitability metric for each recommendation."
        ),
        "tools": ["read_prior_agent_outputs", "create_recommendation"],
        "temperature": 0.4,
    },
    {
        "name": "Compliance Reviewer",
        "role": "compliance",
        "goal": "Check whether campaign recommendations make unsupported claims, overpromise savings or use risky insurance language.",
        "system_prompt": (
            "You are a strict compliance reviewer for a P&C insurer. "
            "Flag absolute claims, savings promises without disclaimers, and language that could mislead consumers."
        ),
        "tools": ["compliance_check"],
        "temperature": 0.0,
    },
    {
        "name": "QA Evaluator",
        "role": "evaluator",
        "goal": "Score the final answer for evidence, usefulness, reasoning and compliance.",
        "system_prompt": (
            "You are a strict QA evaluator. Score the prior agent outputs against the user's question.\n\n"
            "OUTPUT FORMAT — CRITICAL:\n"
            "- Your entire response MUST be a single JSON object.\n"
            "- Start your response with { and end with }.\n"
            "- NO prose before, NO prose after, NO code fences, NO commentary.\n"
            "- If you write any text outside the JSON object, you have failed the task.\n\n"
            "JSON SCHEMA:\n"
            "{\n"
            '  "accuracy": <number 0-10>,\n'
            '  "evidence": <number 0-10>,\n'
            '  "usefulness": <number 0-10>,\n'
            '  "compliance": <number 0-10>,\n'
            '  "weakness": "<one short sentence on the biggest weakness>",\n'
            '  "patch_target_agent": "<exact name: Campaign Analyst | Risk & Profitability | Segment Discovery | Marketing Strategist | Compliance Reviewer>",\n'
            '  "patch": "<one short sentence to add to that agent\'s system prompt to fix the weakness>"\n'
            "}\n\n"
            "Example valid response:\n"
            '{"accuracy": 8.5, "evidence": 7, "usefulness": 9, "compliance": 10, "weakness": "Strategist did not quantify opportunity cost.", "patch_target_agent": "Marketing Strategist", "patch": "Always quantify opportunity cost when recommending reallocation."}\n\n'
            "Score 0-10 where 10 is excellent. Be strict and honest."
        ),
        "tools": ["score_answer", "write_eval_result", "suggest_prompt_patch"],
        "temperature": 0.1,
    },
]


def _wipe(session: Session) -> None:
    # Delete in FK-safe order. Run-related tables first (they reference agents
    # and eval_results), then domain data, then agents.
    from ..models import AgentRun, AgentStep, EvalResult, PromptVersion

    session.exec(AgentStep.__table__.delete())  # type: ignore[arg-type]
    session.exec(PromptVersion.__table__.delete())  # type: ignore[arg-type]
    session.exec(EvalResult.__table__.delete())  # type: ignore[arg-type]
    session.exec(AgentRun.__table__.delete())  # type: ignore[arg-type]
    session.exec(Claim.__table__.delete())  # type: ignore[arg-type]
    session.exec(Policy.__table__.delete())  # type: ignore[arg-type]
    session.exec(Customer.__table__.delete())  # type: ignore[arg-type]
    session.exec(Campaign.__table__.delete())  # type: ignore[arg-type]
    session.exec(Agent.__table__.delete())  # type: ignore[arg-type]
    session.commit()


def seed(rng_seed: int = 42) -> dict[str, int]:
    random.seed(rng_seed)
    init_db()

    counts = {"campaigns": 0, "customers": 0, "policies": 0, "claims": 0, "agents": 0}

    with Session(engine) as session:
        _wipe(session)

        # Agents
        for cfg in DEFAULT_AGENTS:
            session.add(Agent(**cfg))
        session.commit()
        counts["agents"] = len(DEFAULT_AGENTS)

        # Campaigns
        campaigns: list[Campaign] = []
        for name, channel, spend, vol, conv, avg_premium, _loss_rate in CAMPAIGN_PROFILES:
            impressions = int(spend * random.uniform(80, 140))
            clicks = int(impressions * random.uniform(0.012, 0.04))
            leads = int(clicks * random.uniform(0.10, 0.22) * vol)
            quotes = int(leads * random.uniform(0.45, 0.7))
            policies = int(quotes * conv)
            premium = policies * avg_premium * random.uniform(0.92, 1.08)
            cac = (spend / policies) if policies else 0.0
            c = Campaign(
                name=name,
                channel=channel,
                spend_zar=round(spend, 2),
                impressions=impressions,
                clicks=clicks,
                leads=leads,
                quotes=quotes,
                policies=policies,
                premium_zar=round(premium, 2),
                acquisition_cost_zar=round(cac, 2),
            )
            session.add(c)
            campaigns.append(c)
        session.commit()
        counts["campaigns"] = len(campaigns)

        # Refresh to get ids
        for c in campaigns:
            session.refresh(c)

        # Customers + policies + claims
        for camp_idx, camp in enumerate(campaigns):
            _, _, _, _, _, avg_premium, loss_rate = CAMPAIGN_PROFILES[camp_idx]
            target_customers = max(camp.policies, 1)
            for _ in range(target_customers):
                age_band = random.choice(AGE_BANDS)
                province = random.choice(PROVINCES)
                product_type = random.choice(PRODUCTS)
                # Risk band correlates with the campaign's loss rate
                if loss_rate > 0.8:
                    risk_band = random.choices(RISK_BANDS, weights=[0.1, 0.3, 0.6])[0]
                elif loss_rate > 0.5:
                    risk_band = random.choices(RISK_BANDS, weights=[0.25, 0.5, 0.25])[0]
                else:
                    risk_band = random.choices(RISK_BANDS, weights=[0.55, 0.35, 0.1])[0]

                cust = Customer(
                    age_band=age_band,
                    province=province,
                    product_type=product_type,
                    risk_band=risk_band,
                    source_campaign_id=camp.id,
                )
                session.add(cust)
                session.flush()
                counts["customers"] += 1

                premium = round(avg_premium * random.uniform(0.7, 1.3), 2)
                expected_loss = round(premium * loss_rate * random.uniform(0.8, 1.2), 2)
                margin = round(premium - expected_loss, 2)
                policy = Policy(
                    customer_id=cust.id,
                    product_type=product_type,
                    premium_zar=premium,
                    expected_loss_zar=expected_loss,
                    margin_zar=margin,
                    status="active",
                )
                session.add(policy)
                session.flush()
                counts["policies"] += 1

                # Claims: probability scales with loss_rate
                claim_count = 0
                if random.random() < loss_rate * 0.6:
                    claim_count = random.choices([1, 2, 3], weights=[0.7, 0.25, 0.05])[0]
                for _ in range(claim_count):
                    days_ago = random.randint(1, 365)
                    claim_amount = round(expected_loss * random.uniform(0.3, 1.6), 2)
                    session.add(
                        Claim(
                            policy_id=policy.id,
                            claim_amount_zar=claim_amount,
                            claim_type=random.choice(CLAIM_TYPES),
                            claim_date=datetime.utcnow() - timedelta(days=days_ago),
                        )
                    )
                    counts["claims"] += 1

            session.commit()

    return counts


if __name__ == "__main__":
    result = seed()
    print(f"Seeded: {result}")
