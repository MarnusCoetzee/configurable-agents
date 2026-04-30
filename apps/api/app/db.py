from sqlmodel import SQLModel, Session, create_engine

from .config import settings

engine = create_engine(settings.database_url, echo=False, pool_pre_ping=True)


def init_db() -> None:
    # Import models so SQLModel registers them
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_qa_prompt_v2()
    _backfill_v1_prompt_versions()


def _backfill_v1_prompt_versions() -> None:
    """Ensure every agent has a v1 PromptVersion row so the history timeline
    is complete. For agents that have already been patched, reconstruct v1 by
    stripping the applied-patch suffix from the earliest existing version.

    Idempotent.
    """
    from sqlmodel import select

    from .models import Agent, EvalResult, PromptVersion

    with Session(engine) as session:
        agents = list(session.exec(select(Agent)).all())
        for agent in agents:
            existing = sorted(
                session.exec(
                    select(PromptVersion).where(PromptVersion.agent_id == agent.id)
                ).all(),
                key=lambda p: p.version,
            )
            has_v1 = any(p.version == 1 for p in existing)
            if has_v1:
                continue

            if not existing:
                # Agent has never been patched — capture current prompt as v1.
                session.add(
                    PromptVersion(
                        agent_id=agent.id,
                        agent_name=agent.name,
                        version=1,
                        prompt=agent.system_prompt,
                        parent_eval_id=None,
                        created_at=agent.created_at,
                    )
                )
                continue

            # Agent has v2+. Reconstruct v1 by stripping the patch that
            # produced v2 (apply_patch does: prompt.rstrip() + "\n\n" + patch).
            v2 = existing[0]
            v1_prompt = v2.prompt
            if v2.parent_eval_id is not None:
                ev = session.get(EvalResult, v2.parent_eval_id)
                if ev and ev.suggested_patch:
                    suffix = "\n\n" + ev.suggested_patch.strip()
                    if v1_prompt.endswith(suffix):
                        v1_prompt = v1_prompt[: -len(suffix)].rstrip()
            session.add(
                PromptVersion(
                    agent_id=agent.id,
                    agent_name=agent.name,
                    version=1,
                    prompt=v1_prompt,
                    parent_eval_id=None,
                    created_at=agent.created_at,
                )
            )
        session.commit()


def _ensure_qa_prompt_v2() -> None:
    """Keep QA Evaluator's prompt in sync with the canonical seed prompt so
    already-deployed DBs pick up improvements without a re-seed."""
    from sqlmodel import select

    from .models import Agent
    from .seed.generate_fake_data import DEFAULT_AGENTS

    with Session(engine) as session:
        qa = session.exec(select(Agent).where(Agent.name == "QA Evaluator")).first()
        if qa is None:
            return
        new_cfg = next(a for a in DEFAULT_AGENTS if a["name"] == "QA Evaluator")
        if qa.system_prompt == new_cfg["system_prompt"]:
            return
        qa.system_prompt = new_cfg["system_prompt"]
        qa.version += 1
        session.add(qa)
        session.commit()


def get_session():
    with Session(engine) as session:
        yield session
