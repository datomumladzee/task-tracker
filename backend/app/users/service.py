from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.core.totp import generate_secret, verify_code
from app.users.models import User
from app.users.schemas import UserCreate

# The query layer. Takes a session, returns objects. Nothing here imports
# FastAPI or raises HTTPException, so every function can be called from a
# script or a test with no request in sight. The router is what turns these
# results into status codes.

#The dummy hash is used so that password checking also happens for non-existent emails, 
#keeping the response time consistent. This prevents an attacker from figuring out which 
#emails are registered based on response time.
_DUMMY_HASH = hash_password("timing-attack-placeholder")


class EmailAlreadyExists(Exception):
    """The email is taken.

    A domain error, not an HTTP one. The router maps it to 409. Returning
    None instead would tell the caller something failed but not what.
    """


def normalize_email(email: str) -> str:
    """Lowercase, so one inbox cannot become two accounts.

    EmailStr validates the shape but changes nothing. Without this,
    Dato@x.com and dato@x.com both register and both believe they own the
    same address. Applied on write and on every lookup, or they stop matching.
    """
    return email.strip().lower()


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    # scalar_one_or_none gives the object or None, and raises if two rows
    # somehow matched. On a unique column that should be impossible, which is
    # exactly why a loud failure is better than silently taking the first.
    result = await db.execute(select(User).where(User.email == normalize_email(email)))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, data: UserCreate) -> User:
    """Register a user. Raises EmailAlreadyExists if the address is taken."""
    email = normalize_email(data.email)

    # The friendly path. Catches the ordinary case without making the database
    # raise, but it is not a guarantee: two requests can both pass this line
    # before either one inserts.
    if await get_user_by_email(db, email) is None:
        user = User(
            email=email,
            hashed_password=hash_password(data.password),
            full_name=data.full_name,
        )
        db.add(user)
        try:
            await db.commit()
        except IntegrityError:
            # The unique index on users.email is the only real guarantee, and
            # this is it firing. Reached when two registrations for the same
            # address race each other past the check above.
            await db.rollback()
            raise EmailAlreadyExists(email) from None

        # The row exists but this object still holds only what we set. refresh
        # re-reads it so id, created_at and the role default are populated.
        await db.refresh(user)
        return user

    raise EmailAlreadyExists(email)


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    """Return the user if the password is right, otherwise None.

    Says nothing about which half failed. The endpoint must not either, or it
    becomes a way to ask whether an address is registered.
    """
    user = await get_user_by_email(db, email)

    if user is None:
        # Hash anyway. Returning here would make an unknown email answer
        # noticeably faster than a wrong password, and timing that difference
        # is enough to enumerate every address in the table.
        verify_password(password, _DUMMY_HASH)
        return None

    if not verify_password(password, user.hashed_password):
        return None

    return user


class TotpAlreadyEnabled(Exception):
    """2FA is already on for this user.

    Setup must not silently replace a working secret. Doing so would let
    anyone holding a live session quietly swap the second factor for their
    own, which defeats the point of having one.
    """


class TotpNotStarted(Exception):
    """No secret on the row, so there is nothing to verify against."""


async def start_totp_setup(db: AsyncSession, user: User) -> str:
    """Generate and store a new secret. Does not enable 2FA.

    Returns the secret so the router can build the provisioning URI.

    Overwriting an unconfirmed secret is fine and intentional: a user who
    abandoned setup halfway can start again and the old secret was never
    confirmed by anything.
    """
    if user.totp_enabled:
        raise TotpAlreadyEnabled

    user.totp_secret = generate_secret()
    await db.commit()
    return user.totp_secret


async def confirm_totp_setup(db: AsyncSession, user: User, code: str) -> bool:
    """Check the first code and switch 2FA on if it matches.

    This is the step that makes the secret real. Enabling at setup time
    instead would lock out anyone whose QR scan silently failed, because they
    would have no working code and no way back in.
    """
    if user.totp_secret is None:
        raise TotpNotStarted

    if not verify_code(user.totp_secret, code):
        return False

    user.totp_enabled = True
    await db.commit()
    return True


async def verify_totp_login(db: AsyncSession, user: User, code: str) -> bool:
    """Check a code during login. Changes nothing.

    Separate from confirm_totp_setup because that one has a side effect and
    this one must not. Refuses when 2FA is off, so a stale pending token
    cannot be spent against an account that has since turned 2FA off.
    """
    if not user.totp_enabled or user.totp_secret is None:
        return False

    return verify_code(user.totp_secret, code)
