from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import engine, get_session
from ..models import AgentRun, AgentStep
from ..services.workflow_runner import run_workflow

router = APIRouter(prefix="/runs", tags=["runs"])


class RunCreate(BaseModel):
    user_question: str
    workflow_name: str = "campaign-recommendation"


@router.get("")
def list_runs(session: Session = Depends(get_session)) -> list[AgentRun]:
    return list(
        session.exec(select(AgentRun).order_by(AgentRun.created_at.desc())).all()
    )


def _execute_workflow(run_id: int, user_question: str, workflow_name: str) -> None:
    """Background task — opens its own session so it's independent of the request."""
    with Session(engine) as session:
        run = session.get(AgentRun, run_id)
        if not run:
            return
        try:
            run_workflow(
                session=session,
                user_question=user_question,
                workflow_name=workflow_name,
                existing_run=run,
            )
        except Exception as exc:  # noqa: BLE001
            run.status = "failed"
            run.final_answer = f"[workflow error] {type(exc).__name__}: {exc}"
            run.completed_at = datetime.utcnow()
            session.add(run)
            session.commit()


@router.post("", status_code=202)
def create_run(
    payload: RunCreate,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
) -> dict:
    """Fire-and-poll: returns immediately, frontend polls /runs/:id."""
    run = AgentRun(
        workflow_name=payload.workflow_name,
        user_question=payload.user_question,
        status="pending",
    )
    session.add(run)
    session.commit()
    session.refresh(run)

    background.add_task(
        _execute_workflow, run.id, payload.user_question, payload.workflow_name
    )
    return {"run_id": run.id, "status": run.status}


@router.get("/{run_id}")
def get_run(run_id: int, session: Session = Depends(get_session)) -> dict:
    run = session.get(AgentRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    steps = list(
        session.exec(
            select(AgentStep)
            .where(AgentStep.run_id == run_id)
            .order_by(AgentStep.step_order)
        ).all()
    )
    return {"run": run, "steps": steps}
