from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task_list import TaskList, ListMember

router = APIRouter()


class ListCreate(BaseModel):
    name: str
    color: str = "#3B82F6"
    icon: str | None = None


class ListResponse(BaseModel):
    id: int
    name: str
    color: str
    icon: str | None
    owner_id: int

    class Config:
        from_attributes = True


@router.get("/", response_model=list[ListResponse])
async def get_lists(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restituisce le liste dell'utente (proprie + condivise)."""
    # Liste proprie
    result = await db.execute(select(TaskList).where(TaskList.owner_id == user.id))
    owned = result.scalars().all()

    # Liste condivise
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
