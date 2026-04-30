from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import AgentRun, InsightMessage, RunInsight
from ..services.insights import chat_followup, get_or_create_insight

router = APIRouter(prefix="/runs/{run_id}/insights", tags=["insights"])


@router.get("")
def get_insight(run_id: int, session: Session = Depends(get_session)) -> RunInsight:
    insight = session.exec(
        select(RunInsight).where(RunInsight.run_id == run_id)
    ).first()
    if not insight:
        raise HTTPException(404, "No insight generated yet")
    return insight


@router.post("/generate", status_code=201)
def generate_insight(
    run_id: int, session: Session = Depends(get_session)
) -> RunInsight:
    run = session.get(AgentRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if not run.final_answer:
        raise HTTPException(400, "Run has no final answer to summarize")
    return get_or_create_insight(session, run)


@router.post("/regenerate", status_code=201)
def regenerate_insight(
    run_id: int, session: Session = Depends(get_session)
) -> RunInsight:
    run = session.get(AgentRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if not run.final_answer:
        raise HTTPException(400, "Run has no final answer to summarize")
    return get_or_create_insight(session, run, force=True)


@router.get("/messages")
def list_messages(
    run_id: int, session: Session = Depends(get_session)
) -> list[InsightMessage]:
    return list(
        session.exec(
            select(InsightMessage)
            .where(InsightMessage.run_id == run_id)
            .order_by(InsightMessage.created_at)
        ).all()
    )


class ChatBody(BaseModel):
    message: str


@router.post("/chat")
def chat(
    run_id: int,
    payload: ChatBody,
    session: Session = Depends(get_session),
) -> InsightMessage:
    run = session.get(AgentRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if not payload.message.strip():
        raise HTTPException(400, "Empty message")
    return chat_followup(session, run, payload.message.strip())
