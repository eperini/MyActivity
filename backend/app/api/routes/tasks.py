from datetime import date, time
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.task_list import TaskList, ListMember
from app.models.recurrence import RecurrenceRule
from app.models.tag import Tag, task_tags

router = APIRouter()


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    list_id: int
    assigned_to: int | None = None
    priority: int = Field(default=4, ge=1, le=4)
    due_date: date | None = None
    due_time: time | None = None
    parent_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: int | None = Field(default=None, ge=1, le=4)
    status: TaskStatus | None = None
    due_date: date | None = None
    due_time: time | None = None
    assigned_to: int | None = None


class TagResponse(BaseModel):
    id: int
    name: str
    color: str


class TaskResponse(BaseModel):
    id: int
    title: str
    description: str | None
    list_id: int
    created_by: int
    assigned_to: int | None
    assigned_to_name: str | None = None
    priority: int
    status: TaskStatus
    due_date: date | None
    due_time: time | None
    parent_id: int | None
    has_recurrence: bool = False
    next_occurrence: date | None = None
    tags: list[TagResponse] = []

    class Config:
        from_attributes = True


def _should_sync(task) -> bool:
    """Only sync tasks from the configured sync list."""
    return (
        settings.GOOGLE_CALENDAR_ID
        and settings.GOOGLE_SYNC_LIST_ID
        and task.list_id == settings.GOOGLE_SYNC_LIST_ID
        and task.due_date is not None
    )


def _sync_task_to_gcal(task_id: int):
    """Background task: sync a task to Google Calendar."""
    if not settings.GOOGLE_CALENDAR_ID:
        return
    try:
        import asyncio
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession as AS
        from app.services.google_calendar import push_task_to_calendar

        engine = create_async_engine(settings.DATABASE_URL)
        Session = async_sessionmaker(engine, class_=AS, expire_on_commit=False)

        async def _do():
            async with Session() as db:
                task = await db.get(Task, task_id)
                if task and _should_sync(task):
                    event_id = push_task_to_calendar(task)
                    if event_id and event_id != task.google_event_id:
                        task.google_event_id = event_id
                        await db.commit()
            await engine.dispose()

        asyncio.run(_do())
    except Exception as e:
        print(f"Google Calendar sync error for task {task_id}: {e}")


def _delete_task_from_gcal(event_id: str):
    """Background task: delete event from Google Calendar."""
    if not settings.GOOGLE_CALENDAR_ID or not event_id:
        return
    try:
        from app.services.google_calendar import delete_task_from_calendar
        delete_task_from_calendar(event_id)
    except Exception as e:
        print(f"Google Calendar delete error: {e}")


async def _enrich_with_recurrence(tasks: list[Task], db: AsyncSession) -> list[dict]:
    """Add has_recurrence, next_occurrence, tags, assigned_to_name to task dicts."""
    if not tasks:
        return []
    task_ids = [t.id for t in tasks]

    # Recurrence info
    result = await db.execute(
        select(RecurrenceRule.task_id, RecurrenceRule.next_occurrence).where(
            RecurrenceRule.task_id.in_(task_ids)
        )
    )
    recurrence_map = {row.task_id: row.next_occurrence for row in result.all()}

    # Tags per task
    tag_result = await db.execute(
        select(task_tags.c.task_id, Tag.id, Tag.name, Tag.color)
        .join(Tag, task_tags.c.tag_id == Tag.id)
        .where(task_tags.c.task_id.in_(task_ids))
    )
    tags_map: dict[int, list[dict]] = {}
    for row in tag_result.all():
        tags_map.setdefault(row[0], []).append({"id": row[1], "name": row[2], "color": row[3]})

    # Assigned user names
    assigned_ids = {t.assigned_to for t in tasks if t.assigned_to}
    names_map: dict[int, str] = {}
    if assigned_ids:
        from app.models.user import User
        name_result = await db.execute(
            select(User.id, User.display_name).where(User.id.in_(assigned_ids))
        )
        names_map = {row.id: row.display_name for row in name_result.all()}

    enriched = []
    for t in tasks:
        d = {c.name: getattr(t, c.name) for c in t.__table__.columns}
        d["has_recurrence"] = t.id in recurrence_map
        d["next_occurrence"] = recurrence_map.get(t.id)
        d["tags"] = tags_map.get(t.id, [])
        d["assigned_to_name"] = names_map.get(t.assigned_to) if t.assigned_to else None
        enriched.append(d)
    return enriched


@router.get("/", response_model=list[TaskResponse])
async def get_tasks(
    list_id: int | None = Query(None),
    status: TaskStatus | None = Query(None),
    tag_id: int | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Task).where(Task.created_by == user.id)
    if list_id:
        query = query.where(Task.list_id == list_id)
    if status:
        query = query.where(Task.status == status)
    if tag_id:
        query = query.where(Task.id.in_(select(task_tags.c.task_id).where(task_tags.c.tag_id == tag_id)))
    query = query.order_by(Task.priority, Task.due_date)

    result = await db.execute(query)
    tasks = result.scalars().all()
    return await _enrich_with_recurrence(tasks, db)


async def _check_list_access(list_id: int, user_id: int, db: AsyncSession) -> None:
    """Verify user owns or is member of the list."""
    task_list = await db.get(TaskList, list_id)
    if not task_list:
        raise HTTPException(status_code=404, detail="Lista non trovata")
    if task_list.owner_id != user_id:
        member = await db.execute(
            select(ListMember).where(
                ListMember.list_id == list_id,
                ListMember.user_id == user_id,
            )
        )
        if not member.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Non hai accesso a questa lista")


@router.post("/", response_model=TaskResponse)
async def create_task(
    data: TaskCreate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_list_access(data.list_id, user.id, db)
    task = Task(**data.model_dump(), created_by=user.id)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    if _should_sync(task):
        background.add_task(_sync_task_to_gcal, task.id)
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    data: TaskUpdate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task or task.created_by != user.id:
        raise HTTPException(status_code=404, detail="Task non trovato")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    if _should_sync(task):
        background.add_task(_sync_task_to_gcal, task.id)
    return task


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task or task.created_by != user.id:
        raise HTTPException(status_code=404, detail="Task non trovato")
    event_id = task.google_event_id
    await db.delete(task)
    await db.commit()
    if event_id:
        background.add_task(_delete_task_from_gcal, event_id)
    return {"detail": "Task eliminato"}
