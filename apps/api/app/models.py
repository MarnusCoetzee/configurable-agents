from datetime import datetime
from typing import Optional, Any

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.utcnow()


# ---- Agents -------------------------------------------------------------

class Agent(SQLModel, table=True):
    __tablename__ = "agents"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    role: str
    goal: str
    system_prompt: str
    model: str = "MiniMax-M2.7"
    temperature: float = 0.3
    tools: list[str] = Field(default_factory=list, sa_column=Column(JSONB))
    version: int = 1
    enabled: bool = True
    created_at: datetime = Field(default_factory=_utcnow)


# ---- Runs ---------------------------------------------------------------

class AgentRun(SQLModel, table=True):
    __tablename__ = "agent_runs"

    id: Optional[int] = Field(default=None, primary_key=True)
    workflow_name: str
    user_question: str
    status: str = "pending"  # pending | running | completed | failed
    final_answer: Optional[str] = None
    score: Optional[float] = None
    created_at: datetime = Field(default_factory=_utcnow)
    completed_at: Optional[datetime] = None


class AgentStep(SQLModel, table=True):
    __tablename__ = "agent_steps"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="agent_runs.id", index=True)
    agent_id: Optional[int] = Field(default=None, foreign_key="agents.id")
    agent_name: str
    step_order: int
    input: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    output: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    tool_calls: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSONB))
    latency_ms: int = 0
    tokens_used: int = 0
    created_at: datetime = Field(default_factory=_utcnow)


# ---- Marketing / insurance domain --------------------------------------

class Campaign(SQLModel, table=True):
    __tablename__ = "campaigns"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    channel: str
    spend_zar: float = 0.0
    impressions: int = 0
    clicks: int = 0
    leads: int = 0
    quotes: int = 0
    policies: int = 0
    premium_zar: float = 0.0
    acquisition_cost_zar: float = 0.0
    created_at: datetime = Field(default_factory=_utcnow)


class Customer(SQLModel, table=True):
    __tablename__ = "customers"

    id: Optional[int] = Field(default=None, primary_key=True)
    age_band: str
    province: str
    product_type: str
    risk_band: str
    source_campaign_id: Optional[int] = Field(default=None, foreign_key="campaigns.id", index=True)


class Policy(SQLModel, table=True):
    __tablename__ = "policies"

    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: int = Field(foreign_key="customers.id", index=True)
    product_type: str
    premium_zar: float
    expected_loss_zar: float
    margin_zar: float
    status: str = "active"


class Claim(SQLModel, table=True):
    __tablename__ = "claims"

    id: Optional[int] = Field(default=None, primary_key=True)
    policy_id: int = Field(foreign_key="policies.id", index=True)
    claim_amount_zar: float
    claim_type: str
    claim_date: datetime


# ---- Evaluation + prompt versioning ------------------------------------

class EvalResult(SQLModel, table=True):
    __tablename__ = "eval_results"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="agent_runs.id", index=True, unique=True)
    accuracy_score: Optional[float] = None
    usefulness_score: Optional[float] = None
    compliance_score: Optional[float] = None
    evidence_score: Optional[float] = None
    overall_score: Optional[float] = None
    weakness: Optional[str] = None
    suggested_patch_target_agent: Optional[str] = None
    suggested_patch: Optional[str] = None
    patch_applied: bool = False
    raw_qa_text: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)


class PromptVersion(SQLModel, table=True):
    __tablename__ = "prompt_versions"

    id: Optional[int] = Field(default=None, primary_key=True)
    agent_id: int = Field(foreign_key="agents.id", index=True)
    agent_name: str
    version: int
    prompt: str
    parent_eval_id: Optional[int] = Field(default=None, foreign_key="eval_results.id")
    created_at: datetime = Field(default_factory=_utcnow)


# ---- Executive insights + chat ----------------------------------------

class RunInsight(SQLModel, table=True):
    __tablename__ = "run_insights"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="agent_runs.id", index=True, unique=True)
    headline: Optional[str] = None
    tldr: Optional[str] = None
    key_actions: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSONB))
    watch_outs: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSONB))
    key_metrics: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSONB))
    raw_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=_utcnow)


class InsightMessage(SQLModel, table=True):
    __tablename__ = "insight_messages"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="agent_runs.id", index=True)
    role: str  # 'user' | 'assistant'
    content: str
    tokens_used: int = 0
    latency_ms: int = 0
    created_at: datetime = Field(default_factory=_utcnow)
