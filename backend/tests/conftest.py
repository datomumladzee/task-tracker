from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.db import Base, get_db
from app.main import app

# Everything a test needs lives here. Three problems to solve: a database that
# is not the real one, a client that does not need a running server, and
# isolation so tests cannot see each other's rows.

# A second database on the same Postgres container. Tests truncate and delete,
# so pointing them at "tracker" would wipe real data on the first run.
TEST_DB_NAME = "tracker_test"


def _url_for(database: str) -> str:
    """Swap the database name on the configured URL.

    Derived from settings rather than hardcoded, so credentials and host stay
    in one place and the tests follow whatever .env says.
    """
    base, _, _ = settings.database_url.rpartition("/")
    return f"{base}/{database}"


@pytest.fixture(scope="session")
async def _create_test_database() -> AsyncGenerator[None, None]:
    """Create tracker_test once per run, drop it at the end.

    CREATE DATABASE cannot run inside a transaction, hence
    isolation_level="AUTOCOMMIT". Connects to the default postgres database,
    because you cannot drop the database you are connected to.
    """
    admin = create_async_engine(_url_for("postgres"), isolation_level="AUTOCOMMIT")

    async with admin.connect() as conn:
        # Dropped first in case a previous run crashed and left it behind.
        await conn.exec_driver_sql(f"DROP DATABASE IF EXISTS {TEST_DB_NAME}")
        await conn.exec_driver_sql(f"CREATE DATABASE {TEST_DB_NAME}")

    yield

    async with admin.connect() as conn:
        await conn.exec_driver_sql(f"DROP DATABASE IF EXISTS {TEST_DB_NAME}")

    await admin.dispose()


@pytest.fixture(scope="session")
async def engine(_create_test_database: None) -> AsyncGenerator:
    """One engine for the run, with the schema built from the models.

    create_all rather than running Alembic: it is faster and it keeps a broken
    migration from taking the whole suite down with it. The tradeoff is that
    these tests do not prove the migrations produce this schema. `alembic
    check` against the real database covers that separately.
    """
    test_engine = create_async_engine(_url_for(TEST_DB_NAME))

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield test_engine

    await test_engine.dispose()


@pytest.fixture
async def db(engine) -> AsyncGenerator[AsyncSession, None]:
    """A session whose every change is rolled back after the test.

    The isolation trick: open one connection, start a transaction on it, and
    bind the session to that connection. The application code still calls
    commit(), so join_transaction_mode="create_savepoint" turns those into
    SAVEPOINT releases inside the outer transaction. Rolling that outer
    transaction back at the end undoes everything, committed or not.

    Faster than recreating tables per test, and it means tests can run in any
    order without seeing each other's rows.
    """
    connection = await engine.connect()
    transaction = await connection.begin()

    Session = async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    session = Session()

    yield session

    await session.close()
    await transaction.rollback()
    await connection.close()


@pytest.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """An HTTP client that talks to the app in memory.

    ASGITransport calls the app directly, so there is no uvicorn, no port and
    no network. The dependency override is what makes endpoints use the
    rolled-back session instead of opening their own.
    """

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    # Cleared, or the override leaks into anything else using this app object.
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Small helpers, so the tests below stay about behaviour rather than plumbing.
# ---------------------------------------------------------------------------

DEFAULT_PASSWORD = "hunter2!!"


@pytest.fixture
def register(client: AsyncClient):
    async def _register(email: str = "user@example.com", password: str = DEFAULT_PASSWORD):
        return await client.post(
            "/auth/register",
            json={"email": email, "password": password, "full_name": "Test User"},
        )

    return _register


@pytest.fixture
def login(client: AsyncClient):
    async def _login(email: str = "user@example.com", password: str = DEFAULT_PASSWORD):
        return await client.post(
            "/auth/login",
            json={"email": email, "password": password},
        )

    return _login


@pytest.fixture
def auth_headers(register, login):
    """Register a user, log in, and return a ready Authorization header."""

    async def _auth_headers(email: str = "user@example.com") -> dict[str, str]:
        await register(email)
        token = (await login(email)).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _auth_headers
