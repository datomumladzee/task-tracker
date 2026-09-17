from collections.abc import Awaitable, Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.projects.models import ProjectMember, ProjectRole
from app.projects.service import get_membership
from app.users.models import User

# The permission check for everything under /projects/{project_id}. A route
# opts in with one argument, so the rule lives here once rather than being
# rewritten inside each endpoint.

# Python has no idea ADMIN outranks VIEWER, so the order is written down.
# "Needs STANDARD" then means "your rank is at least 2".
ROLE_RANK: dict[ProjectRole, int] = {
    ProjectRole.VIEWER: 1,
    ProjectRole.STANDARD: 2,
    ProjectRole.ADMIN: 3,
}

# roles have a simple ranking:
# VIEWER = 1 → STANDARD = 2 → ADMIN = 3
# It simply compares the numbers.


def require_project_role(
    minimum: ProjectRole,
) -> Callable[..., Awaitable[ProjectMember]]:
    """Build a dependency that demands at least `minimum` on the project.

    A function that returns a dependency, so one piece of code produces every
    check: require_project_role(ProjectRole.ADMIN) for deleting a project,
    require_project_role(ProjectRole.VIEWER) for reading one.

    The route's path must name its parameter project_id. FastAPI matches the
    argument below to the path by that name.
    """

    async def check(
        project_id: int,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> ProjectMember:
        member = await get_membership(db, project_id, user.id)

        if member is None:
            # 404, not 403, and the same answer whether the project does not
            # exist or exists without you. A 403 here would let anyone walk
            # ids 1, 2, 3 and learn which projects are real.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        if ROLE_RANK[member.role] < ROLE_RANK[minimum]:
            # 403 is fine here. A member already knows the project exists, so
            # saying they lack the role gives nothing away.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires the {minimum.value} role on this project",
            )

        # The endpoint gets the membership, and the project through it, so it
        # does not look either up a second time.
        return member

    return check
# Not a member        → 404  Project not found
# Project doesn't exist → 404  same message, same code
# Role too low        → 403  Requires the admin role on this project
# Role high enough    → your membership, with the project already loaded
