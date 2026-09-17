from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.projects.models import Project, ProjectMember, ProjectRole
from app.users.service import get_user_by_email

# The week 2 rule applies here: plain arguments in, plain objects out. No
# Request, no Depends, no HTTPException, and no Pydantic schemas as arguments.
# Week 3's intake flow will call these directly without building an HTTP
# request, so nothing here may assume one exists.


class ProjectNotFound(Exception):
    pass


class UserNotFound(Exception):
    """No active account with that email."""


class AlreadyMember(Exception):
    pass


class NotMember(Exception):
    pass


class LastAdmin(Exception):
    """Refused because it would leave the project with no ADMIN.

    There is no owner column, so project_members is the only place authority
    lives. A project with no ADMIN can never have its members changed again.
    """


class _Unset:
    """Marks an argument the caller did not pass.

    None cannot mean that, because for description None is a real value that
    means clear it. Without a separate marker a partial update cannot tell
    "leave description alone" from "remove the description".
    """

    def __repr__(self) -> str:
        return "UNSET"


UNSET = _Unset()


# ---------------------------------------------------------------------------
# projects
# ---------------------------------------------------------------------------


async def create_project(
    db: AsyncSession,
    *,
    user_id: int,
    name: str,
    description: str | None = None,
) -> Project:
    """Create a project and make its creator the first ADMIN.

    Two inserts, one transaction. flush sends the project INSERT so Postgres
    assigns an id, but commits nothing. If the membership insert then fails,
    neither row is ever committed. Committing between them instead could leave
    a project that exists and that nobody is allowed to manage.
    """
    project = Project(name=name, description=description, created_by_id=user_id)
    db.add(project)
    await db.flush()

    db.add(ProjectMember(project_id=project.id, user_id=user_id, role=ProjectRole.ADMIN))
    await db.commit()
    return project


async def get_project(db: AsyncSession, project_id: int) -> Project | None:
    result = await db.execute(select(Project).where(Project.id == project_id))
    return result.scalar_one_or_none()


async def list_projects_for_user(
    db: AsyncSession,
    user_id: int,
) -> list[tuple[Project, ProjectRole]]:
    """Every project the user belongs to, with their role on each.

    The join through project_members is the visibility rule. A project the
    user is not a member of never appears, so there is nothing to filter out
    afterwards and nothing to forget to filter.
    """
    result = await db.execute(
        select(Project, ProjectMember.role)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user_id)
        .order_by(Project.created_at.desc(), Project.id.desc())
    )
    return list(result.tuples().all())


async def update_project(
    db: AsyncSession,
    project: Project,
    *,
    name: str | _Unset = UNSET,
    description: str | None | _Unset = UNSET,
) -> Project:
    """Change only the fields that were passed.

    name has no None option because the column is NOT NULL. description does,
    because clearing it is a legitimate edit.
    """
    if not isinstance(name, _Unset):
        project.name = name
    if not isinstance(description, _Unset):
        project.description = description

    await db.commit()
    return project


async def delete_project(db: AsyncSession, project: Project) -> None:
    """Delete a project and, through the database, everything under it.

    passive_deletes=True on the relationships means SQLAlchemy does not load
    members, tasks and comments to delete them one at a time. It issues one
    DELETE and ON DELETE CASCADE in Postgres removes the rest.
    """
    await db.delete(project)
    await db.commit()


# ---------------------------------------------------------------------------
# membership
# ---------------------------------------------------------------------------


async def get_membership(
    db: AsyncSession,
    project_id: int,
    user_id: int,
) -> ProjectMember | None:
    """The one question every permission check asks.

    None means not a member, which the RBAC dependency will treat the same as
    the project not existing, so non-members cannot probe which ids are real.

    The project is loaded with it, so member.project is usable afterwards.
    joinedload rather than selectinload because this is one row pointing at
    one project: a JOIN in the same query beats a second query.
    """
    result = await db.execute(
        select(ProjectMember)
        .options(joinedload(ProjectMember.project))
        .where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_members(db: AsyncSession, project_id: int) -> list[ProjectMember]:
    """Members with their user rows loaded.

    selectinload is what makes member.user usable. It runs a second query,
    SELECT from users WHERE id IN (...), and attaches the results, so the
    number of queries stays at two however many members there are.

    Without it, touching member.user would try a lazy load. That does not work
    under async, and lazy="raise" on the relationship turns the failure into
    an immediate error naming ProjectMember.user.
    """
    result = await db.execute(
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.created_at, ProjectMember.id)
    )
    return list(result.scalars().all())


async def add_member(
    db: AsyncSession,
    *,
    project_id: int,
    email: str,
    role: ProjectRole = ProjectRole.STANDARD,
) -> ProjectMember:
    """Add a user to a project by email.

    Raises UserNotFound when there is no active account, and AlreadyMember when
    they are already in. A disabled account counts as not found, since adding
    one would grant access to someone who cannot log in to use it.
    """
    user = await get_user_by_email(db, email)
    if user is None or not user.is_active:
        raise UserNotFound(email)

    # Assigning the user object rather than only user_id populates the
    # relationship, so the caller can read member.user without another query.
    member = ProjectMember(project_id=project_id, user_id=user.id, user=user, role=role)
    db.add(member)

    try:
        await db.commit()
    except IntegrityError:
        # uq_project_member firing. Same reasoning as registration: checking
        # first would lose the race, the constraint is the real guarantee.
        await db.rollback()
        raise AlreadyMember(email) from None

    return member


async def change_member_role(
    db: AsyncSession,
    *,
    project_id: int,
    user_id: int,
    role: ProjectRole,
) -> ProjectMember:
    """Change a member's role, refusing to demote the last ADMIN."""
    result = await db.execute(
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise NotMember(user_id)

    if member.role == ProjectRole.ADMIN and role != ProjectRole.ADMIN:
        if await _count_admins_locked(db, project_id) <= 1:
            raise LastAdmin

    member.role = role
    await db.commit()
    return member


async def remove_member(db: AsyncSession, *, project_id: int, user_id: int) -> None:
    """Remove someone from a project, refusing to remove the last ADMIN."""
    member = await get_membership(db, project_id, user_id)
    if member is None:
        raise NotMember(user_id)

    if member.role == ProjectRole.ADMIN:
        if await _count_admins_locked(db, project_id) <= 1:
            raise LastAdmin

    await db.delete(member)
    await db.commit()


async def _count_admins_locked(db: AsyncSession, project_id: int) -> int:
    """Count ADMINs while holding a lock on their rows until commit.

    The race this closes: two ADMINs demote each other at the same moment.
    Without a lock both transactions count two admins, both proceed, and the
    project ends with none.

    FOR UPDATE makes the second transaction wait for the first to commit, then
    re-read the rows. By then one of them is no longer ADMIN, so it counts one
    and refuses.

    Selects ids and counts in Python because Postgres does not allow FOR UPDATE
    together with an aggregate like COUNT.
    """
    result = await db.execute(
        select(ProjectMember.id)
        .where(
            ProjectMember.project_id == project_id,
            ProjectMember.role == ProjectRole.ADMIN,
        )
        .with_for_update()
    )
    return len(result.all())
