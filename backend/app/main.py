"""The entry point. `uvicorn app.main:app` imports this file and takes `app`.

The two router imports below are the import dependency chain: importing one
file runs its imports, which run theirs, so those lines pull in every other
module in app/. Along the way each @router.post decorator attaches its route
to a router, and each model registers itself on Base.metadata.

config.py sits at the bottom of that chain, which is why a missing env var
stops the app at startup instead of on some later request.
"""

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.router import router as auth_router
from app.core.db import get_db
from app.users.router import router as users_router

app = FastAPI(title="Task Tracker API")

# Routers are attached here, not defined here. main.py stays a table of
# contents: what the app is, and which groups of endpoints it serves.
app.include_router(auth_router)
app.include_router(users_router)


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
