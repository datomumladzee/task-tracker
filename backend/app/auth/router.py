from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, decode_token
from app.core.totp import provisioning_uri
from app.users import service
from app.users.models import User
from app.users.schemas import (
    LoginRequest,
    LoginResponse,
    TotpCode,
    TotpLoginRequest,
    TotpSetupResponse,
    UserCreate,
    UserRead,
)

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

    if user.totp_enabled:
        # The password was right but it is not enough. No access token is
        # issued here. The pending token only says who is asking, expires in
        # five minutes, and decode_token refuses it anywhere an access token
        # is required.
        return LoginResponse(
            mfa_required=True,
            pending_token=create_access_token(user.id, token_type="pending_2fa"),
        )

    return LoginResponse(
        mfa_required=False,
        access_token=create_access_token(user.id),
    )


@router.post("/2fa/setup", response_model=TotpSetupResponse)
async def totp_setup(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TotpSetupResponse:
    """Start 2FA setup. Generates a secret and returns a QR payload.

    Authenticated, because the response carries the secret in clear text.
    2FA is not on when this returns, /2fa/verify is what switches it on.
    """
    try:
        secret = await service.start_totp_setup(db, user)
    except service.TotpAlreadyEnabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Two-factor authentication is already enabled",
        ) from None

    return TotpSetupResponse(
        provisioning_uri=provisioning_uri(secret, user.email),
        secret=secret,
    )


@router.post("/2fa/verify", response_model=UserRead)
async def totp_verify(
    data: TotpCode,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Confirm the first code and enable 2FA.

    Proves the app was actually paired before the account starts depending on
    it. Returns the updated user so a client can see totp_enabled flip.
    """
    try:
        ok = await service.confirm_totp_setup(db, user, data.code)
    except service.TotpNotStarted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Call /auth/2fa/setup first",
        ) from None

    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid code",
        )

    return user


@router.post("/2fa/login", response_model=LoginResponse)
async def totp_login(
    data: TotpLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """Step two of login. Pending token plus a code, for a real token.

    Not protected by get_current_user, because the caller is not authenticated
    yet. The pending token is read directly, and decode_token is told to
    accept only that type, so an access token cannot be replayed here.
    """
    subject = decode_token(data.pending_token, expected_type="pending_2fa")

    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session, log in again",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await service.get_user_by_id(db, int(subject))

    # Re-checked rather than trusted from step one. The five minute window is
    # long enough for an account to be deleted or disabled in between.
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session, log in again",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not await service.verify_totp_login(db, user, data.code):
        # Same message whether the code was wrong or 2FA was turned off since
        # the pending token was issued.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid code",
        )

    return LoginResponse(
        mfa_required=False,
        access_token=create_access_token(user.id),
    )
