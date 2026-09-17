from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.projects import service
from app.projects.deps import ROLE_RANK, require_project_role
from app.projects.models import Project, ProjectMember, ProjectRole
from app.projects.schemas import (
    MemberAdd,
    MemberRead,
    MemberRoleUpdate,
    ProjectCreate,
    ProjectListItem,
    ProjectRead,
    ProjectUpdate,
)
from app.users.models import User

# Thin on purpose. Permissions come from the dependency in each signature, the
# work comes from the service, and this file only connects the two and turns
# service errors into status codes.

router = APIRouter(prefix="/projects", tags=["projects"])

# Built once and reused, so every signature reads as a plain requirement.
viewer = require_project_role(ProjectRole.VIEWER)
admin = require_project_role(ProjectRole.ADMIN)


# ---------------------------------------------------------------------------
# projects
# ---------------------------------------------------------------------------


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Any logged-in user can create a project, and becomes its admin."""
    return await service.create_project(
        db, user_id=user.id, name=data.name, description=data.description
    )


@router.get("", response_model=list[ProjectListItem])
async def list_projects(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectListItem]:
    """Only projects you belong to, each with your role on it."""
    rows = await service.list_projects_for_user(db, user.id)
    return [
        ProjectListItem(**ProjectRead.model_validate(project).model_dump(), role=role)
        for project, role in rows
    ]


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(member: ProjectMember = Depends(viewer)) -> Project:
    # The dependency already loaded the project with the membership.
    return member.project


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    data: ProjectUpdate,
    member: ProjectMember = Depends(admin),
    db: AsyncSession = Depends(get_db),
) -> Project:
    # exclude_unset keeps only the fields the client actually sent, so an
    # omitted description is left alone and an explicit null clears it.
    return await service.update_project(
        db, member.project, **data.model_dump(exclude_unset=True)
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    member: ProjectMember = Depends(admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.delete_project(db, member.project)


# ---------------------------------------------------------------------------
# members
# ---------------------------------------------------------------------------


@router.get("/{project_id}/members", response_model=list[MemberRead])
async def list_members(
    member: ProjectMember = Depends(viewer),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectMember]:
    return await service.list_members(db, member.project_id)


@router.post(
    "/{project_id}/members",
    response_model=MemberRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    data: MemberAdd,
    member: ProjectMember = Depends(admin),
    db: AsyncSession = Depends(get_db),
) -> ProjectMember:
    try:
        return await service.add_member(
            db, project_id=member.project_id, email=data.email, role=data.role
        )
    except service.UserNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active account with that email",
        ) from None
    except service.AlreadyMember:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already a member of this project",
        ) from None


@router.patch("/{project_id}/members/{user_id}", response_model=MemberRead)
async def change_member_role(
    user_id: int,
    data: MemberRoleUpdate,
    member: ProjectMember = Depends(admin),
    db: AsyncSession = Depends(get_db),
) -> ProjectMember:
    try:
        return await service.change_member_role(
            db, project_id=member.project_id, user_id=user_id, role=data.role
        )
    except service.NotMember:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="That user is not a member of this project",
        ) from None
    except service.LastAdmin:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A project needs at least one admin",
        ) from None


@router.delete(
    "/{project_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_member(
    user_id: int,
    member: ProjectMember = Depends(viewer),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a member, or leave the project yourself.

    The one endpoint whose rule depends on its arguments, so it cannot be a
    single dependency. Any member gets in. Removing yourself is always allowed,
    removing anyone else needs admin. Leaving as the last admin is still
    refused, by the service.
    """
    leaving = user_id == member.user_id

    if not leaving and ROLE_RANK[member.role] < ROLE_RANK[ProjectRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires the admin role on this project",
        )

    try:
        await service.remove_member(db, project_id=member.project_id, user_id=user_id)
    except service.NotMember:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="That user is not a member of this project",
        ) from None
    except service.LastAdmin:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A project needs at least one admin",
        ) from None
