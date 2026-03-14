from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.heading import ProjectHeading
from app.models.task import Task
from app.api.routes.projects import _check_project_access

router = APIRouter()


# ── Schemas ───────────────────────────────────────────


class HeadingCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class HeadingUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)


class HeadingReorder(BaseModel):
    ids: list[int]


class HeadingResponse(BaseModel):
    id: int
    project_id: int
    name: str
    position: int

    class Config:
        from_attributes = True


# ── Routes ────────────────────────────────────────────


@router.get("/projects/{project_id}/headings", response_model=list[HeadingResponse])
async def get_headings(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    result = await db.execute(
        select(ProjectHeading)
        .where(ProjectHeading.project_id == project_id)
        .order_by(ProjectHeading.position, ProjectHeading.id)
    )
    return result.scalars().all()


@router.post("/projects/{project_id}/headings", response_model=HeadingResponse)
async def create_heading(
    project_id: int,
    data: HeadingCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)

    # Get next position
    result = await db.execute(
        select(ProjectHeading.position)
        .where(ProjectHeading.project_id == project_id)
        .order_by(ProjectHeading.position.desc())
        .limit(1)
    )
    max_pos = result.scalar()
    next_pos = (max_pos + 1) if max_pos is not None else 0

    heading = ProjectHeading(
        project_id=project_id,
        name=data.name,
        position=next_pos,
    )
    db.add(heading)
    await db.commit()
    await db.refresh(heading)
    return heading


@router.patch("/projects/{project_id}/headings/{heading_id}", response_model=HeadingResponse)
async def update_heading(
    project_id: int,
    heading_id: int,
    data: HeadingUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    heading = await db.get(ProjectHeading, heading_id)
    if not heading or heading.project_id != project_id:
        raise HTTPException(status_code=404, detail="Sezione non trovata")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(heading, field, value)

    await db.commit()
    await db.refresh(heading)
    return heading


@router.delete("/projects/{project_id}/headings/{heading_id}")
async def delete_heading(
    project_id: int,
    heading_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    heading = await db.get(ProjectHeading, heading_id)
    if not heading or heading.project_id != project_id:
        raise HTTPException(status_code=404, detail="Sezione non trovata")

    # Clear heading_id on tasks that reference this heading
    result = await db.execute(
        select(Task).where(Task.heading_id == heading_id)
    )
    for task in result.scalars().all():
        task.heading_id = None

    await db.delete(heading)
    await db.commit()
    return {"detail": "Sezione eliminata"}


@router.patch("/projects/{project_id}/headings/reorder")
async def reorder_headings(
    project_id: int,
    data: HeadingReorder,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    if not data.ids:
        raise HTTPException(status_code=400, detail="ids richiesti")

    for i, hid in enumerate(data.ids):
        heading = await db.get(ProjectHeading, hid)
        if heading and heading.project_id == project_id:
            heading.position = i

    await db.commit()
    return {"detail": "Riordinato"}
