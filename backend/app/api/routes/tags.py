from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.tag import Tag, task_tags
from app.models.task import Task

router = APIRouter()


class TagCreate(BaseModel):
    name: str
    color: str = "#6B7280"


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


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


@router.post("/tasks/{task_id}/tags/{tag_id}")
async def add_tag_to_task(task_id: int, tag_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    tag = await db.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(404, "Tag non trovato")
    await db.execute(task_tags.insert().values(task_id=task_id, tag_id=tag_id))
    await db.commit()
    return {"detail": "Tag aggiunto"}


@router.delete("/tasks/{task_id}/tags/{tag_id}")
async def remove_tag_from_task(task_id: int, tag_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(
        delete(task_tags).where(task_tags.c.task_id == task_id, task_tags.c.tag_id == tag_id)
    )
    await db.commit()
    return {"detail": "Tag rimosso"}
