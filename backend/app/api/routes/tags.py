import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.tag import Tag, task_tags
from app.models.task import Task
from app.models.task_list import TaskList, ListMember

router = APIRouter()

HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default="#6B7280", pattern=r"^#[0-9a-fA-F]{6}$")


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


@router.get("/")
async def list_tags(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).where(Tag.user_id == user.id).order_by(Tag.name))
    return [{"id": t.id, "name": t.name, "color": t.color} for t in result.scalars().all()]


@router.post("/")
async def create_tag(data: TagCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(Tag).where(Tag.user_id == user.id, Tag.name == data.name.lower())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Tag già esistente")

    tag = Tag(name=data.name.lower(), color=data.color, user_id=user.id)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return {"id": tag.id, "name": tag.name, "color": tag.color}


@router.patch("/{tag_id}")
async def update_tag(tag_id: int, data: TagUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    tag = await db.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(404, "Tag non trovato")
    if data.name is not None:
        tag.name = data.name.lower()
    if data.color is not None:
        tag.color = data.color
    await db.commit()
    return {"id": tag.id, "name": tag.name, "color": tag.color}


@router.delete("/{tag_id}")
async def delete_tag(tag_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    tag = await db.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(404, "Tag non trovato")
    await db.delete(tag)
    await db.commit()
    return {"detail": "Tag eliminato"}


async def _check_task_access(task_id: int, user_id: int, db: AsyncSession) -> Task:
    """Verify user has access to the task."""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task non trovato")
    if task.created_by == user_id:
        return task
    task_list = await db.get(TaskList, task.list_id)
    if task_list and task_list.owner_id == user_id:
        return task
    member = await db.execute(
        select(ListMember).where(ListMember.list_id == task.list_id, ListMember.user_id == user_id)
    )
    if not member.scalar_one_or_none():
        raise HTTPException(403, "Non hai accesso a questo task")
    return task


@router.post("/tasks/{task_id}/tags/{tag_id}")
async def add_tag_to_task(task_id: int, tag_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _check_task_access(task_id, user.id, db)
    tag = await db.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(404, "Tag non trovato")
    # Avoid duplicate
    existing = await db.execute(
        select(task_tags).where(task_tags.c.task_id == task_id, task_tags.c.tag_id == tag_id)
    )
    if existing.first():
        return {"detail": "Tag già presente"}
    await db.execute(task_tags.insert().values(task_id=task_id, tag_id=tag_id))
    await db.commit()
    return {"detail": "Tag aggiunto"}


@router.delete("/tasks/{task_id}/tags/{tag_id}")
async def remove_tag_from_task(task_id: int, tag_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _check_task_access(task_id, user.id, db)
    await db.execute(
        delete(task_tags).where(task_tags.c.task_id == task_id, task_tags.c.tag_id == tag_id)
    )
    await db.commit()
    return {"detail": "Tag rimosso"}
