"""Reset utilities. Two levels:

  python -m app.seed.reset --runs        # wipe runs/evals/prompt history,
                                         # reset agents to seed defaults.
                                         # Keeps campaigns/customers/policies/claims.

  python -m app.seed.reset --full        # wipe EVERYTHING and re-seed
                                         # (delegates to generate_fake_data.seed)
"""

from __future__ import annotations

import argparse
from sqlmodel import Session, select

from ..db import engine, init_db
from ..models import (
    Agent,
    AgentRun,
    AgentStep,
    EvalResult,
    PromptVersion,
)
from .generate_fake_data import DEFAULT_AGENTS, seed as full_seed


def reset_runs() -> dict[str, int]:
    """Soft reset: drop all runs/evals/prompt history, restore agents to
    canonical seed prompts at v1. Domain data (campaigns/policies/claims)
    is left untouched."""
    init_db()

    counts = {
        "agent_steps": 0,
        "eval_results": 0,
        "prompt_versions": 0,
        "agent_runs": 0,
        "agents_reset": 0,
    }

    with Session(engine) as session:
        # FK-safe order
        # prompt_versions references eval_results; eval_results + agent_steps
        # reference agent_runs. Delete in dependency order.
        counts["agent_steps"] = session.exec(AgentStep.__table__.delete()).rowcount or 0  # type: ignore[arg-type]
        counts["prompt_versions"] = session.exec(PromptVersion.__table__.delete()).rowcount or 0  # type: ignore[arg-type]
        counts["eval_results"] = session.exec(EvalResult.__table__.delete()).rowcount or 0  # type: ignore[arg-type]
        counts["agent_runs"] = session.exec(AgentRun.__table__.delete()).rowcount or 0  # type: ignore[arg-type]
        session.commit()

        # Restore agents to canonical seed
        defaults_by_name = {a["name"]: a for a in DEFAULT_AGENTS}
        agents = list(session.exec(select(Agent)).all())
        for agent in agents:
            cfg = defaults_by_name.get(agent.name)
            if not cfg:
                continue
            agent.role = cfg["role"]
            agent.goal = cfg["goal"]
            agent.system_prompt = cfg["system_prompt"]
            agent.model = cfg.get("model", "MiniMax-M2.7")
            agent.temperature = cfg["temperature"]
            agent.tools = cfg["tools"]
            agent.version = 1
            agent.enabled = True
            session.add(agent)
            counts["agents_reset"] += 1
        session.commit()

        # Re-seed v1 PromptVersion rows (init_db's backfill will do this on next start,
        # but do it now so the history page is immediately consistent).
        for agent in session.exec(select(Agent)).all():
            session.add(
                PromptVersion(
                    agent_id=agent.id,
                    agent_name=agent.name,
                    version=1,
                    prompt=agent.system_prompt,
                    parent_eval_id=None,
                )
            )
        session.commit()

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset the cockpit database")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--runs",
        action="store_true",
        help="Wipe runs/evals/prompt history; reset agents to seed defaults; keep domain data.",
    )
    group.add_argument(
        "--full",
        action="store_true",
        help="Wipe EVERYTHING and re-seed (campaigns, customers, policies, agents, all).",
    )
    args = parser.parse_args()

    if args.runs:
        result = reset_runs()
        print(f"Soft reset done: {result}")
    elif args.full:
        result = full_seed()
        print(f"Full re-seed done: {result}")


if __name__ == "__main__":
    main()
