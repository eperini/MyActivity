from datetime import date, time
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.recurrence import RecurrenceRule

router = APIRouter()


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    list_id: int
    assigned_to: int | None = None
    priority: int = 4
    due_date: date | None = None
    due_time: time | None = None
    parent_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: int | None = None
    status: TaskStatus | None = None
    due_date: date | None = None
    due_time: time | None = None
    assigned_to: int | None = None


class TaskResponse(BaseModel):
    id: int
    title: str
    description: str | None
    list_id: int
    created_by: int
    assigned_to: int | None
    priority: int
    status: TaskStatus
    due_date: date | None
    due_time: time | None
    parent_id: int | None
    has_recurrence: bool = False

    class Config:
        from_attributes = True


async def _enrich_with_recurrence(tasks: list[Task], db: AsyncSession) -> list[dict]:
    """Add has_recurrence flag to task dicts."""
    if not tasks:
        return []
    task_ids = [t.id for t in tasks]
    result = await db.execute(
        select(RecurrenceRule.task_id).where(RecurrenceRule.task_id.in_(task_ids))
    )
    recurring_ids = set(result.scalars().all())
    enriched = []
    for t in tasks:
        d = {c.name: getattr(t, c.name) for c in t.__table__.columns}
        d["has_recurrence"] = t.id in recurring_ids
        enriched.append(d)
    return enriched


@router.get("/", response_model=list[TaskResponse])
async def get_tasks(
    list_id: int | None = Query(None),
    status: TaskStatus | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Task).where(Task.created_by == user.id)
    if list_id:
        query = query.where(Task.list_id == list_id)
    if status:
        query = query.where(Task.status == status)
    query = query.order_by(Task.priority, Task.due_date)

    result = await db.execute(query)
    tasks = result.scalars().all()
    return await _enrich_with_recurrence(tasks, db)


@router.post("/", response_model=TaskResponse)
async def create_task(
    data: TaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = Task(**data.model_dump(), created_by=user.id)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    data: TaskUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    await db.delete(task)
    await db.commit()
    return {"detail": "Task eliminato"}
