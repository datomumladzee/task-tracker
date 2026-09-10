from httpx import AsyncClient

from app.core.security import create_access_token


async def test_me_without_a_token_is_401(client: AsyncClient):
    response = await client.get("/users/me")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


async def test_me_with_a_valid_token_returns_the_user(client: AsyncClient, auth_headers):
    headers = await auth_headers("me@example.com")
    response = await client.get("/users/me", headers=headers)

    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"


async def test_me_never_returns_the_hash(client: AsyncClient, auth_headers):
    headers = await auth_headers()
    body = (await client.get("/users/me", headers=headers)).json()

    assert "hashed_password" not in body


async def test_me_rejects_a_garbage_token(client: AsyncClient):
    response = await client.get(
        "/users/me", headers={"Authorization": "Bearer not-a-real-token"}
    )

    assert response.status_code == 401


async def test_me_rejects_a_tampered_token(client: AsyncClient, auth_headers):
    headers = await auth_headers()
    tampered = headers["Authorization"][:-2] + "xx"

    response = await client.get("/users/me", headers={"Authorization": tampered})

    assert response.status_code == 401


async def test_me_rejects_the_wrong_auth_scheme(client: AsyncClient, auth_headers):
    headers = await auth_headers()
    token = headers["Authorization"].removeprefix("Bearer ")

    response = await client.get("/users/me", headers={"Authorization": f"Basic {token}"})

    assert response.status_code == 401


async def test_me_rejects_an_expired_token(client: AsyncClient, register, db):
    from app.users.service import get_user_by_email

    await register("expired@example.com")
    user = await get_user_by_email(db, "expired@example.com")
    expired = create_access_token(user.id, expires_minutes=-1)

    response = await client.get(
        "/users/me", headers={"Authorization": f"Bearer {expired}"}
    )

    assert response.status_code == 401


async def test_me_rejects_a_pending_2fa_token(client: AsyncClient, register, db):
    """A half authenticated caller must not reach a protected route. This is
    the type claim doing its job."""
    from app.users.service import get_user_by_email

    await register("half@example.com")
    user = await get_user_by_email(db, "half@example.com")
    pending = create_access_token(user.id, token_type="pending_2fa")

    response = await client.get(
        "/users/me", headers={"Authorization": f"Bearer {pending}"}
    )

    assert response.status_code == 401


async def test_token_stops_working_when_the_user_is_deleted(
    client: AsyncClient, auth_headers, db
):
    """A signed token cannot be recalled, so the database lookup in
    get_current_user is the only thing that makes deletion effective."""
    from sqlalchemy import delete

    from app.users.models import User

    headers = await auth_headers("doomed@example.com")
    assert (await client.get("/users/me", headers=headers)).status_code == 200

    await db.execute(delete(User).where(User.email == "doomed@example.com"))
    await db.commit()

    assert (await client.get("/users/me", headers=headers)).status_code == 401


async def test_token_stops_working_when_the_user_is_disabled(
    client: AsyncClient, auth_headers, db
):
    from sqlalchemy import update

    from app.users.models import User

    headers = await auth_headers("suspend@example.com")

    await db.execute(
        update(User).where(User.email == "suspend@example.com").values(is_active=False)
    )
    await db.commit()

    response = await client.get("/users/me", headers=headers)

    assert response.status_code == 401
    assert response.json()["detail"] == "Inactive user"
