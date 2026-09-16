from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints, field_validator

from app.projects.models import ProjectRole
from app.users.schemas import UserSummary

# Stripped before the length check, so "   " is rejected as empty rather than
# stored as a project called three spaces.
ProjectName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
]


class ProjectCreate(BaseModel):
    name: ProjectName
    description: str | None = None


class ProjectUpdate(BaseModel):
    """A partial update. Only the fields the client actually sent change.

    The router reads this with exclude_unset, which is what separates "not
    sent" from "sent as null". That distinction matters for description,
    where null means clear it.
    """

    name: ProjectName | None = None
    description: str | None = None

    @field_validator("name")
    @classmethod
    def name_cannot_be_null(cls, value: str | None) -> str | None:
        # Runs only when name was actually sent, since Pydantic does not
        # validate defaults. So an omitted name passes, and an explicit
        # {"name": null} is a 422 here instead of a NOT NULL crash in Postgres.
        if value is None:
            raise ValueError("name cannot be null")
        return value


class ProjectRead(BaseModel):
    id: int
    name: str
    description: str | None
    created_by_id: int | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectListItem(ProjectRead):
    """A project plus the caller's role on it.

    Included in the list so the frontend knows which buttons to show without
    making a members request per project.
    """

    role: ProjectRole


class MemberRead(BaseModel):
    """A member with enough about the person to display them.

    user is nested, so the service must load ProjectMember.user before this is
    built. With lazy="raise" on that relationship, forgetting fails loudly and
    names the relationship.
    """

    user: UserSummary
    role: ProjectRole
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MemberAdd(BaseModel):
    """Add someone by email rather than id.

    Nobody knows a teammate's user id. Email is what people actually have, and
    it is what week 3 will resolve "assign to Dato" against anyway.
    """

    email: EmailStr
    role: ProjectRole = ProjectRole.STANDARD


class MemberRoleUpdate(BaseModel):
    role: ProjectRole
