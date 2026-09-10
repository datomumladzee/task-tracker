from httpx import AsyncClient


# ---------------------------------------------------------------------------
# register
# ---------------------------------------------------------------------------


async def test_register_creates_user(register):
    response = await register("new@example.com")

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new@example.com"
    assert body["role"] == "member"
    assert body["is_active"] is True
    assert body["id"] > 0


async def test_register_never_returns_the_hash(register):
    """The point of response_model=UserRead. A hash was written on this
    request and must not appear in the reply."""
    body = (await register()).json()

    assert "hashed_password" not in body
    assert "password" not in body


async def test_register_duplicate_email_is_409(register):
    await register("taken@example.com")
    response = await register("taken@example.com")

    assert response.status_code == 409


async def test_register_duplicate_ignores_letter_case(register):
    """Emails are lowercased on write and on lookup, so one inbox cannot
    become two accounts."""
    await register("Dato@Example.com")
    response = await register("DATO@example.com")

    assert response.status_code == 409


async def test_register_stores_email_lowercased(register):
    assert (await register("MiXeD@Example.com")).json()["email"] == "mixed@example.com"


async def test_register_rejects_malformed_email(client: AsyncClient):
    """422 from Pydantic, before any of our code runs."""
    response = await client.post(
        "/auth/register",
        json={"email": "not-an-email", "password": "hunter2!!", "full_name": "X"},
    )

    assert response.status_code == 422


async def test_register_rejects_short_password(client: AsyncClient):
    response = await client.post(
        "/auth/register",
        json={"email": "a@example.com", "password": "short", "full_name": "X"},
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# login
# ---------------------------------------------------------------------------


async def test_login_returns_a_token(register, login):
    await register()
    response = await login()

    assert response.status_code == 200
    body = response.json()
    assert body["mfa_required"] is False
    assert body["access_token"]
    assert body["pending_token"] is None
    assert body["token_type"] == "bearer"


async def test_login_wrong_password_is_401(register, login):
    await register()
    response = await login(password="definitely-wrong")

    assert response.status_code == 401


async def test_login_unknown_email_is_401(login):
    response = await login("ghost@example.com")

    assert response.status_code == 401


async def test_login_failures_are_indistinguishable(register, login):
    """Wrong password and unknown email must read identically, or the
    endpoint becomes a way to ask whether an address is registered."""
    await register("real@example.com")

    wrong_password = await login("real@example.com", "definitely-wrong")
    unknown_email = await login("ghost@example.com", "definitely-wrong")

    assert wrong_password.status_code == unknown_email.status_code
    assert wrong_password.json() == unknown_email.json()


async def test_login_sends_www_authenticate_header(login):
    response = await login("ghost@example.com")

    assert response.headers["www-authenticate"] == "Bearer"


async def test_disabled_account_cannot_log_in(register, login, db):
    from sqlalchemy import update

    from app.users.models import User

    await register("off@example.com")
    await db.execute(
        update(User).where(User.email == "off@example.com").values(is_active=False)
    )
    await db.commit()

    response = await login("off@example.com")

    assert response.status_code == 403
