from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task_list import TaskList, ListMember
from app.models.task import Task

router = APIRouter()


class ListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    color: str = "#3B82F6"
    icon: str | None = None


class ListUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    color: str | None = None
    icon: str | None = None


class ListResponse(BaseModel):
    id: int
    name: str
    color: str
    icon: str | None
    owner_id: int

    class Config:
        from_attributes = True


async def _check_list_owner(list_id: int, user_id: int, db: AsyncSession) -> TaskList:
    task_list = await db.get(TaskList, list_id)
    if not task_list:
        raise HTTPException(status_code=404, detail="Lista non trovata")
    if task_list.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Non sei il proprietario di questa lista")
    return task_list


@router.get("/", response_model=list[ListResponse])
async def get_lists(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restituisce le liste dell'utente (proprie + condivise)."""
    result = await db.execute(select(TaskList).where(TaskList.owner_id == user.id))
    owned = result.scalars().all()

    result = await db.execute(
        select(TaskList)
        .join(ListMember)
        .where(ListMember.user_id == user.id)
    )
    shared = result.scalars().all()

    all_lists = {l.id: l for l in [*owned, *shared]}
    return list(all_lists.values())


@router.post("/", response_model=ListResponse)
async def create_list(
    data: ListCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task_list = TaskList(name=data.name, color=data.color, icon=data.icon, owner_id=user.id)
    db.add(task_list)
    await db.commit()
    await db.refresh(task_list)
    return task_list


@router.patch("/{list_id}", response_model=ListResponse)
async def update_list(
    list_id: int,
    data: ListUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task_list = await _check_list_owner(list_id, user.id, db)
    if data.name is not None:
        task_list.name = data.name
    if data.color is not None:
        task_list.color = data.color
    if data.icon is not None:
        task_list.icon = data.icon
    await db.commit()
    await db.refresh(task_list)
    return task_list


@router.delete("/{list_id}")
async def delete_list(
    list_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task_list = await _check_list_owner(list_id, user.id, db)
    # Delete tasks in this list first
    result = await db.execute(select(Task).where(Task.list_id == list_id))
    for task in result.scalars().all():
        await db.delete(task)
    # Delete list members
    result = await db.execute(select(ListMember).where(ListMember.list_id == list_id))
    for member in result.scalars().all():
        await db.delete(member)
    await db.delete(task_list)
    await db.commit()
    return {"detail": "Lista eliminata"}
