from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db

app = FastAPI(title="Task Tracker API")


@app.get("/health")
async def health():
    """Liveness: the process is running. Says nothing about the database.

    Separate from /health/db because a dead process should be restarted,
    an unreachable database usually should not.
    """
    return {"status": "ok"}


@app.get("/health/db")
async def health_db(db: AsyncSession = Depends(get_db)):
    """Readiness: the app can reach Postgres.

    No try/except on purpose, so setup errors surface as a traceback.
    """
    # Raw SQL must be wrapped in text() in SQLAlchemy 2.0.

    result = await db.execute(text("SELECT 1"))
    return {"status": "ok", "db_result": result.scalar()}
