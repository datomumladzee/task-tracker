from typing import NamedTuple

import pyotp
import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from app.users.service import get_user_by_email

# pyotp generates valid codes here, so the whole two-step login is testable in
# milliseconds with no phone involved.


async def _secret_for(db, email: str) -> str:
    user = await get_user_by_email(db, email)
    await db.refresh(user)
    return user.totp_secret


def _code(secret: str) -> str:
    return pyotp.TOTP(secret).now()


class Enabled2FA(NamedTuple):
    email: str
    secret: str
    # The token issued before 2FA was switched on. Still valid afterwards,
    # which is what happens in real life: enabling 2FA does not end the session
    # you enabled it from. Carried here because auth_headers cannot produce a
    # token for a 2FA user, login only hands back a pending token.
    headers: dict[str, str]


@pytest.fixture
async def enabled_2fa(client: AsyncClient, auth_headers, db) -> Enabled2FA:
    """A user with 2FA fully switched on."""
    email = "2fa@example.com"
    headers = await auth_headers(email)

    setup = await client.post("/auth/2fa/setup", headers=headers)
    secret = setup.json()["secret"]

    await client.post(
        "/auth/2fa/verify", headers=headers, json={"code": _code(secret)}
    )
    return Enabled2FA(email=email, secret=secret, headers=headers)


# ---------------------------------------------------------------------------
# setup
# ---------------------------------------------------------------------------


async def test_setup_returns_a_provisioning_uri(client: AsyncClient, auth_headers):
    headers = await auth_headers("setup@example.com")
    response = await client.post("/auth/2fa/setup", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["provisioning_uri"].startswith("otpauth://totp/")
    assert body["secret"] in body["provisioning_uri"]


async def test_setup_requires_authentication(client: AsyncClient):
    """The response carries the secret in clear text, so it cannot be public."""
    assert (await client.post("/auth/2fa/setup")).status_code == 401


async def test_setup_does_not_enable_2fa(client: AsyncClient, auth_headers, db):
    """The gap between having a secret and having 2FA on. Without it, a failed
    QR scan would lock the user out of their own account."""
    headers = await auth_headers("pending@example.com")
    await client.post("/auth/2fa/setup", headers=headers)

    user = await get_user_by_email(db, "pending@example.com")
    await db.refresh(user)

    assert user.totp_secret is not None
    assert user.totp_enabled is False

    # Login still hands out a real token, because 2FA is not on yet.
    assert (await client.post(
        "/auth/login",
        json={"email": "pending@example.com", "password": "hunter2!!"},
    )).json()["mfa_required"] is False


async def test_setup_refuses_when_2fa_is_already_on(client: AsyncClient, enabled_2fa):
    """Otherwise anyone holding a live session could quietly swap the second
    factor for their own."""
    response = await client.post("/auth/2fa/setup", headers=enabled_2fa.headers)

    assert response.status_code == 409


# ---------------------------------------------------------------------------
# verify
# ---------------------------------------------------------------------------


async def test_verify_with_a_wrong_code_is_401(client: AsyncClient, auth_headers):
    headers = await auth_headers("wrong@example.com")
    await client.post("/auth/2fa/setup", headers=headers)

    response = await client.post(
        "/auth/2fa/verify", headers=headers, json={"code": "000000"}
    )

    assert response.status_code == 401


async def test_verify_with_the_real_code_enables_2fa(client: AsyncClient, auth_headers, db):
    headers = await auth_headers("enable@example.com")
    secret = (await client.post("/auth/2fa/setup", headers=headers)).json()["secret"]

    response = await client.post(
        "/auth/2fa/verify", headers=headers, json={"code": _code(secret)}
    )

    assert response.status_code == 200
    user = await get_user_by_email(db, "enable@example.com")
    await db.refresh(user)
    assert user.totp_enabled is True


async def test_verify_before_setup_is_400(client: AsyncClient, auth_headers):
    headers = await auth_headers("nosetup@example.com")

    response = await client.post(
        "/auth/2fa/verify", headers=headers, json={"code": "123456"}
    )

    assert response.status_code == 400


@pytest.mark.parametrize("bad", ["12345", "1234567", "abcdef", ""])
async def test_verify_rejects_malformed_codes(client: AsyncClient, auth_headers, bad):
    """Caught by the schema, so verification never sees them."""
    headers = await auth_headers("malformed@example.com")

    response = await client.post("/auth/2fa/verify", headers=headers, json={"code": bad})

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# the two step login
# ---------------------------------------------------------------------------


async def test_login_with_2fa_on_returns_no_access_token(client: AsyncClient, enabled_2fa):
    email = enabled_2fa.email

    body = (await client.post(
        "/auth/login", json={"email": email, "password": "hunter2!!"}
    )).json()

    assert body["mfa_required"] is True
    assert body["access_token"] is None
    assert body["pending_token"]


async def test_pending_token_is_useless_on_a_protected_route(
    client: AsyncClient, enabled_2fa
):
    email = enabled_2fa.email
    pending = (await client.post(
        "/auth/login", json={"email": email, "password": "hunter2!!"}
    )).json()["pending_token"]

    response = await client.get(
        "/users/me", headers={"Authorization": f"Bearer {pending}"}
    )

    assert response.status_code == 401


async def test_second_step_returns_a_working_token(client: AsyncClient, enabled_2fa):
    email, secret = enabled_2fa.email, enabled_2fa.secret
    pending = (await client.post(
        "/auth/login", json={"email": email, "password": "hunter2!!"}
    )).json()["pending_token"]

    second = await client.post(
        "/auth/2fa/login", json={"pending_token": pending, "code": _code(secret)}
    )

    assert second.status_code == 200
    body = second.json()
    assert body["mfa_required"] is False
    assert body["access_token"]

    me = await client.get(
        "/users/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == email


async def test_second_step_with_a_wrong_code_is_401(client: AsyncClient, enabled_2fa):
    email = enabled_2fa.email
    pending = (await client.post(
        "/auth/login", json={"email": email, "password": "hunter2!!"}
    )).json()["pending_token"]

    response = await client.post(
        "/auth/2fa/login", json={"pending_token": pending, "code": "000000"}
    )

    assert response.status_code == 401


async def test_access_token_cannot_be_used_as_a_pending_token(
    client: AsyncClient, enabled_2fa, db
):
    """Without this check an ordinary access token would skip the second
    factor entirely."""
    email, secret = enabled_2fa.email, enabled_2fa.secret
    user = await get_user_by_email(db, email)
    access = create_access_token(user.id)

    response = await client.post(
        "/auth/2fa/login", json={"pending_token": access, "code": _code(secret)}
    )

    assert response.status_code == 401


async def test_second_step_rejects_an_expired_pending_token(
    client: AsyncClient, enabled_2fa, db
):
    email, secret = enabled_2fa.email, enabled_2fa.secret
    user = await get_user_by_email(db, email)
    expired = create_access_token(user.id, token_type="pending_2fa", expires_minutes=-1)

    response = await client.post(
        "/auth/2fa/login", json={"pending_token": expired, "code": _code(secret)}
    )

    assert response.status_code == 401
