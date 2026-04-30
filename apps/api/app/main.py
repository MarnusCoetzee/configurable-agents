from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routers import agents, campaigns, dashboard, evals, insights, runs


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Insurance Agent Cockpit API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router)
app.include_router(campaigns.router)
app.include_router(runs.router)
app.include_router(dashboard.router)
app.include_router(evals.router)
app.include_router(insights.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
