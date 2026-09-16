from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.users.models import UserRole

# Schemas are the wire contract. Models describe a row in Postgres, these
# describe JSON. They are deliberately different classes: the model carries
# hashed_password, and none of these do, which is what stops a hash from ever
# reaching a response.


class UserCreate(BaseModel):
    """What POST /auth/register accepts.

    FastAPI validates against this before the endpoint body runs, so a bad
    email is a 422 that no code of ours had to write.
    """

    # EmailStr is why email-validator is now a dependency. 320 matches the
    # column, so a value that passes here always fits in the table.
    email: EmailStr = Field(max_length=320)

    # Argon2 has no length limit, unlike bcrypt's 72 bytes, so the maximum is
    # not about the algorithm. It is here so nobody can post a 10 MB password
    # and make the server burn CPU hashing it.
    password: str = Field(min_length=8, max_length=128)

    full_name: str = Field(min_length=1, max_length=255)


class UserRead(BaseModel):
    """What any endpoint is allowed to say about a user.

    Used as response_model, so FastAPI drops every field not listed here.
    hashed_password is absent on purpose and must stay absent.
    """

    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime

    # Pydantic reads dictionaries by default. The service layer returns a User
    # object, where the values live in attributes instead. This flag is what
    # lets the schema read one, and its absence is behind most of the
    # "response_model does not work" confusion.
    model_config = ConfigDict(from_attributes=True)


class UserSummary(BaseModel):
    """Another user, as seen by a teammate.

    Smaller than UserRead on purpose. A project member list or a task assignee
    should show who someone is, not their system role, whether their account is
    active, or when they signed up.
    """

    id: int
    email: EmailStr
    full_name: str

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    """What POST /auth/login accepts.

    No length rules on password here. Login checks a hash, it does not create
    one, and rejecting a too-short password at login would leak the fact that
    the stored one is short.
    """

    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """The one response shape both login steps return.

    Fixed now, before TOTP exists, because changing it later would mean
    changing the frontend at the same time.

    mfa_required False: the password was right and 2FA is off, so
    access_token is a real token and the caller is logged in.

    mfa_required True: the password was right but a TOTP code is still
    needed. access_token stays null and pending_token carries the
    short-lived token that step two exchanges for a real one.

    Two named fields rather than one reused field, so a frontend that forgets
    to read mfa_required gets a null it will notice, not a token it cannot
    use for what it thinks.
    """

    mfa_required: bool = False
    access_token: str | None = None
    pending_token: str | None = None
    token_type: str = "bearer"


class TotpSetupResponse(BaseModel):
    """What POST /auth/2fa/setup returns.

    The URI carries the secret in clear text, which is why this endpoint is
    authenticated and why the value must never be logged. The frontend turns
    it into a QR code and shows it once.

    secret is returned as well so a user whose camera will not cooperate can
    type it into the app by hand. 2FA is still off at this point.
    """

    provisioning_uri: str
    secret: str


class TotpCode(BaseModel):
    """Six digits from the authenticator app.

    min and max both 6 so a wrong length is a 422 and never reaches the
    verification path.
    """

    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TotpLoginRequest(BaseModel):
    """Step two of login: the pending token plus a code.

    The pending token is what says who is asking. Without it this endpoint
    would need the email again, and would then be a way to test codes against
    any account.
    """

    pending_token: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
