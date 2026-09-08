from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# Connection pool. One per app, lives as long as the app does.
# "+asyncpg" in the URL is what selects the async driver.

engine = create_async_engine(settings.database_url, echo=False)

# A factory that produces sessions, not a session itself.

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    # Without this, touching an attribute after commit fires a hidden SELECT.
    # In async that raises, because the query needs an await.
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Parent class for every model.

    Each model registers its table on Base.metadata, which Alembic reads to
    generate migrations. Models must be imported or Alembic sees nothing.
    """


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """One session per request.

    `async with` closes it even if the endpoint raised, which returns the
    borrowed connection to the pool.
    """
    async with AsyncSessionLocal() as session:
        yield session
