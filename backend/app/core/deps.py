from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_token
from app.users.models import User
from app.users.service import get_user_by_id

# Sits between the routers and security.py. This is the only consumer of
# decode_token, and the only place that turns a bad token into a status code.

# HTTPBearer rather than OAuth2PasswordBearer. The OAuth2 flavour makes the
# docs Authorize button post form-encoded username and password to a token
# URL, and /auth/login takes JSON, so that button would fail every time.
# HTTPBearer asks for the token itself, which is what a JSON API hands out.
#
# auto_error=False so a missing header reaches us as None instead of
# FastAPI's own 403. A request with no token is unauthenticated, not
# forbidden, so it should be a 401 like every other failure here.
bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    """Every failure below is a 401 with the same shape.

    WWW-Authenticate: Bearer is the standard header for this scheme. It tells
    a client "you are not logged in" rather than "you may not do that".
    """
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the Authorization header into a User, or raise 401.

    Never called directly. FastAPI supplies both arguments, and a route opts
    in by declaring `user: User = Depends(get_current_user)`.
    """
    if credentials is None:
        raise _unauthorized("Not authenticated")

    # HTTPBearer hands back an object, not a string. .credentials is the token
    # with the "Bearer " prefix already stripped.
    subject = decode_token(credentials.credentials)

    if subject is None:
        # Covers a bad signature, a tampered payload, an expired token, and a
        # pending_2fa token used where an access token is required. Deliberately
        # one message for all four: telling a caller which one failed helps
        # nobody but an attacker.
        raise _unauthorized("Invalid or expired token")

    # sub is a string because PyJWT requires it. User.id is an int.
    try:
        user_id = int(subject)
    except ValueError:
        raise _unauthorized("Invalid or expired token") from None

    user = await get_user_by_id(db, user_id)

    if user is None:
        # The token is validly signed but the row is gone. Deleting a user has
        # to stop their outstanding tokens working, and this is the only check
        # that does it, since a signed token cannot be recalled.
        raise _unauthorized("Invalid or expired token")

    if not user.is_active:
        # 401 rather than the 403 login uses. On a token the honest answer is
        # that this token no longer grants anything, not that the caller is
        # known and refused.
        raise _unauthorized("Inactive user")

    return user
