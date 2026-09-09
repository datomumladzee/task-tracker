from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.users.models import User
from app.users.schemas import UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_me(user: User = Depends(get_current_user)) -> User:
    """The current user, resolved entirely from the token.

    The whole of route protection is the Depends in the signature. Everything
    else, the header, the signature check, the expiry, the lookup, the 401s,
    happens in get_current_user before this body runs. A route with no such
    argument is public.

    Returns the User model, and response_model=UserRead is what drops
    hashed_password on the way out.
    """
    return user
