from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

# Nothing in this file imports FastAPI, the database, or a model. It is four
# pure functions, so every one of them can be tried in a Python shell and the
# layers above can stay free of crypto details.

ALGORITHM = "HS256"

# "access" is a real login. "pending_2fa" is issued after the password checks
# out but before the TOTP code does, so step two knows who is asking without
# handing out a usable token. Declared now because adding a claim later
# invalidates every token already in circulation.
TokenType = Literal["access", "pending_2fa"]

# The window to type a 6 digit code, not a session length.
PENDING_2FA_EXPIRE_MINUTES = 5

# Argon2id. Built once at import, because it holds tuned cost parameters.
password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Hash a password for storage. One way, there is no reverse.

    Wrapped rather than called directly elsewhere so swapping the algorithm
    touches this file only. The salt is random per call and travels inside
    the returned string, which is why two hashes of the same password differ.
    """
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a typed password against a stored hash.

    Returns False instead of raising on a malformed hash, so a corrupt row
    fails the login rather than 500ing the endpoint.
    """
    try:
        return password_hash.verify(plain_password, hashed_password)
    except Exception:
        return False


def create_access_token(
    subject: str | int,
    token_type: TokenType = "access",
    expires_minutes: int | None = None,
) -> str:
    """Sign a JWT naming who the caller is.

    The token is signed, not encrypted. Anyone holding it can read the
    payload, so it carries an id and nothing private.
    """
    if expires_minutes is None:
        expires_minutes = (
            PENDING_2FA_EXPIRE_MINUTES
            if token_type == "pending_2fa"
            else settings.access_token_expire_minutes
        )

    now = datetime.now(timezone.utc)
    payload = {
        # str() because PyJWT rejects a non-string "sub", and User.id is an int.
        "sub": str(subject),
        "type": token_type,
        # Aware UTC on purpose. A naive datetime here would be read as local
        # time and expire at the wrong moment.
        "exp": now + timedelta(minutes=expires_minutes),
        "iat": now,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: TokenType = "access") -> str | None:
    """Verify a token and return its subject, or None if it is no good.

    Returns None rather than raising an HTTP error because this layer must
    not know HTTP exists. core/deps.py is what turns None into a 401.

    algorithms is a whitelist, not a hint. Without it a forged token could
    name its own algorithm, including "none".
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        # Covers a bad signature, a tampered payload, and an expired token.
        return None

    # A pending_2fa token must never be accepted where an access token is
    # required. Checking the type is what makes the two-step login safe.
    if payload.get("type") != expected_type:
        return None

    return payload.get("sub")
