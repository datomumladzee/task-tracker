from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import create_access_token
from app.users import service
from app.users.schemas import LoginRequest, LoginResponse, UserCreate, UserRead

# The HTTP layer, and the only place in the auth flow that knows status codes
# exist. It calls downward into the service and translates what comes back.
# Keeping it thin is the point: if logic starts appearing here, it belongs in
# service.py where it can be tested without a request.

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)) -> UserRead:
    """Create an account.

    response_model=UserRead is what strips hashed_password from the User the
    service returns. Without it this endpoint would publish a hash.

    201 rather than 200, because a new resource exists afterwards.
    """
    try:
        return await service.create_user(db, data)
    except service.EmailAlreadyExists:
        # The service raised a domain error with no idea what HTTP is. Turning
        # it into a status code is this layer's job.
        #
        # 409 Conflict does tell an attacker the address is registered. That
        # is accepted here: any register form that refuses duplicates leaks
        # the same fact, and hiding it would mean lying to a real user about
        # whether their signup worked.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        ) from None


@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    """Exchange an email and password for a token."""
    user = await service.authenticate_user(db, data.email, data.password)

    if user is None:
        # One message for a wrong password and for an email that does not
        # exist. Two different messages here would undo the timing work in
        # service.authenticate_user by leaking the same fact in plain text.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            # The standard header for a bearer scheme. Clients use it to tell
            # "you are not logged in" apart from "you may not do that".
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        # Deliberately distinct from the 401 above, and it does confirm the
        # account exists. The trade is that a disabled user otherwise sees
        # "incorrect password" and retypes it forever. Swap this for the same
        # 401 if enumeration matters more than that.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is disabled",
        )

    # Where the second factor will branch. Once User has totp_enabled, this
    # becomes: if enabled, return mfa_required=True with a pending_token from
    # create_access_token(user.id, token_type="pending_2fa") and no access
    # token. The response shape already covers both, so adding it changes no
    # contract and no frontend code.
    return LoginResponse(
        mfa_required=False,
        access_token=create_access_token(user.id),
    )
