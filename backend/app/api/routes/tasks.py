from datetime import date, time, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.task_list import TaskList, ListMember
from app.models.recurrence import RecurrenceRule
from app.models.tag import Tag, task_tags
from app.models.time_log import TimeLog
from app.api.routes.projects import _check_project_access

router = APIRouter()


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    list_id: int
    assigned_to: int | None = None
    priority: int = Field(default=4, ge=1, le=4)
    due_date: date | None = None
    due_time: time | None = None
    parent_id: int | None = None
    project_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    list_id: int | None = None
    priority: int | None = Field(default=None, ge=1, le=4)
    status: TaskStatus | None = None
    due_date: date | None = None
    due_time: time | None = None
    assigned_to: int | None = None
    project_id: int | None = None
    estimated_minutes: int | None = None


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
    project_id: int | None = None
    parent_id: int | None
    has_recurrence: bool = False
    next_occurrence: date | None = None
    tags: list[TagResponse] = []
    subtask_count: int = 0
    subtask_done_count: int = 0
    estimated_minutes: int | None = None
    time_logged_minutes: int = 0
    time_logged_formatted: str = ""
    jira_issue_key: str | None = None
    jira_url: str | None = None

    class Config:
        from_attributes = True


def _should_sync(task) -> bool:
    """Only sync top-level tasks from the configured sync list."""
    return (
        settings.GOOGLE_CALENDAR_ID
        and settings.GOOGLE_SYNC_LIST_ID
        and task.list_id == settings.GOOGLE_SYNC_LIST_ID
        and task.due_date is not None
        and task.parent_id is None
    )


_gcal_engine = None
_gcal_session_factory = None


def _get_gcal_session():
    """Get a reusable async session for Google Calendar sync."""
    global _gcal_engine, _gcal_session_factory
    if _gcal_engine is None:
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession as AS
        _gcal_engine = create_async_engine(settings.DATABASE_URL, pool_size=2, max_overflow=2)
        _gcal_session_factory = async_sessionmaker(_gcal_engine, class_=AS, expire_on_commit=False)
    return _gcal_session_factory


def _sync_task_to_gcal(task_id: int):
    """Background task: sync a task to Google Calendar."""
    if not settings.GOOGLE_CALENDAR_ID:
        return
    try:
        import asyncio
        from app.services.google_calendar import push_task_to_calendar

        Session = _get_gcal_session()

        async def _do():
            async with Session() as db:
                task = await db.get(Task, task_id)
                if task and _should_sync(task):
                    event_id = push_task_to_calendar(task)
                    if event_id and event_id != task.google_event_id:
                        task.google_event_id = event_id
                        await db.commit()

        asyncio.run(_do())
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Google Calendar sync error for task %s: %s", task_id, e)


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

    # Time logged per task
    time_result = await db.execute(
        select(TimeLog.task_id, func.sum(TimeLog.minutes).label("total"))
        .where(TimeLog.task_id.in_(task_ids))
        .group_by(TimeLog.task_id)
    )
    time_map = {row.task_id: row.total for row in time_result.all()}

    # Subtask counts
    subtask_result = await db.execute(
        select(
            Task.parent_id,
            func.count().label("total"),
            func.count(case((Task.status == TaskStatus.DONE, 1))).label("done"),
        )
        .where(Task.parent_id.in_(task_ids))
        .group_by(Task.parent_id)
    )
    subtask_map = {row.parent_id: (row.total, row.done) for row in subtask_result.all()}

    enriched = []
    for t in tasks:
        d = {c.name: getattr(t, c.name) for c in t.__table__.columns}
        d["has_recurrence"] = t.id in recurrence_map
        d["next_occurrence"] = recurrence_map.get(t.id)
        d["tags"] = tags_map.get(t.id, [])
        d["assigned_to_name"] = names_map.get(t.assigned_to) if t.assigned_to else None
        sc = subtask_map.get(t.id, (0, 0))
        d["subtask_count"] = sc[0]
        d["subtask_done_count"] = sc[1]
        logged = time_map.get(t.id, 0)
        d["time_logged_minutes"] = logged
        h, m = divmod(logged, 60)
        d["time_logged_formatted"] = f"{h}h {m}m" if h and m else f"{h}h" if h else f"{m}m" if logged else ""
        d["estimated_minutes"] = t.estimated_minutes
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
    # Include tasks from owned lists + lists where user is a member
    from app.models.task_list import ListMember
    owned_list_ids = select(TaskList.id).where(TaskList.owner_id == user.id)
    member_list_ids = select(ListMember.list_id).where(ListMember.user_id == user.id)
    query = select(Task).where(
        Task.list_id.in_(owned_list_ids.union(member_list_ids)),
        Task.parent_id.is_(None),
    )
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
    if data.project_id is not None:
        await _check_project_access(data.project_id, user.id, db)
    task_data = data.model_dump()
    if task_data.get("assigned_to") is not None:
        target_user = await db.get(User, task_data["assigned_to"])
        if not target_user:
            raise HTTPException(status_code=404, detail="Utente assegnato non trovato")
    if task_data.get("assigned_to") is None:
        task_data["assigned_to"] = user.id
    task = Task(**task_data, created_by=user.id)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    if _should_sync(task):
        background.add_task(_sync_task_to_gcal, task.id)

    # Trigger automations for task creation
    if task.project_id:
        from app.workers.tasks import evaluate_automations
        evaluate_automations.delay(task.id, "task_created", {})

    enriched = await _enrich_with_recurrence([task], db)
    return enriched[0]


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    data: TaskUpdate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    await _check_list_access(task.list_id, user.id, db)

    update_data = data.model_dump(exclude_unset=True)

    # Track changes for automation triggers
    old_status = task.status
    old_assigned_to = task.assigned_to

    # If changing list, verify access to new list too
    if "list_id" in update_data and update_data["list_id"] != task.list_id:
        await _check_list_access(update_data["list_id"], user.id, db)
    if "project_id" in update_data and update_data["project_id"] is not None:
        await _check_project_access(update_data["project_id"], user.id, db)
    if "assigned_to" in update_data and update_data["assigned_to"] is not None:
        target_user = await db.get(User, update_data["assigned_to"])
        if not target_user:
            raise HTTPException(status_code=404, detail="Utente assegnato non trovato")
    for field, value in update_data.items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    if _should_sync(task):
        background.add_task(_sync_task_to_gcal, task.id)

    # Trigger automations if task belongs to a project
    if task.project_id:
        from app.workers.tasks import evaluate_automations
        if "status" in update_data and task.status != old_status:
            evaluate_automations.delay(
                task.id, "status_changed",
                {"old_status": old_status.value, "new_status": task.status.value},
            )
        if "assigned_to" in update_data and task.assigned_to != old_assigned_to:
            evaluate_automations.delay(
                task.id, "assigned_to_changed",
                {"old_assigned_to": old_assigned_to, "new_assigned_to": task.assigned_to},
            )

    enriched = await _enrich_with_recurrence([task], db)
    return enriched[0]


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    await _check_list_access(task.list_id, user.id, db)
    event_id = task.google_event_id
    await db.delete(task)
    await db.commit()
    if event_id:
        background.add_task(_delete_task_from_gcal, event_id)
    return {"detail": "Task eliminato"}


# ── Subtask endpoints ──────────────────────────────────────────────


class SubtaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    priority: int = Field(default=4, ge=1, le=4)


async def _get_parent_task(task_id: int, user: User, db: AsyncSession) -> Task:
    """Get parent task and verify access."""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    await _check_list_access(task.list_id, user.id, db)
    return task


@router.get("/{task_id}/subtasks", response_model=list[TaskResponse])
async def get_subtasks(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    parent = await _get_parent_task(task_id, user, db)
    result = await db.execute(
        select(Task)
        .where(Task.parent_id == parent.id)
        .order_by(Task.position, Task.id)
    )
    subtasks = result.scalars().all()
    return await _enrich_with_recurrence(subtasks, db)


@router.post("/{task_id}/subtasks", response_model=TaskResponse)
async def create_subtask(
    task_id: int,
    data: SubtaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    parent = await _get_parent_task(task_id, user, db)
    # Get next position
    max_pos = await db.execute(
        select(func.coalesce(func.max(Task.position), -1))
        .where(Task.parent_id == parent.id)
    )
    next_pos = max_pos.scalar() + 1

    subtask = Task(
        title=data.title,
        list_id=parent.list_id,
        created_by=user.id,
        parent_id=parent.id,
        priority=data.priority,
        position=next_pos,
    )
    db.add(subtask)
    await db.commit()
    await db.refresh(subtask)
    enriched = await _enrich_with_recurrence([subtask], db)
    return enriched[0]


@router.patch("/{task_id}/subtasks/{subtask_id}/toggle", response_model=TaskResponse)
async def toggle_subtask(
    task_id: int,
    subtask_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_parent_task(task_id, user, db)
    subtask = await db.get(Task, subtask_id)
    if not subtask or subtask.parent_id != task_id:
        raise HTTPException(status_code=404, detail="Subtask non trovato")

    if subtask.status == TaskStatus.DONE:
        subtask.status = TaskStatus.TODO
        subtask.completed_at = None
    else:
        subtask.status = TaskStatus.DONE
        subtask.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(subtask)
    enriched = await _enrich_with_recurrence([subtask], db)
    return enriched[0]


@router.patch("/{task_id}/subtasks/reorder")
async def reorder_subtasks(
    task_id: int,
    data: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_parent_task(task_id, user, db)
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="ids richiesti")

    for i, sid in enumerate(ids):
        subtask = await db.get(Task, sid)
        if subtask and subtask.parent_id == task_id:
            subtask.position = i
    await db.commit()
    return {"detail": "Riordinato"}


@router.patch("/reorder")
async def reorder_tasks(
    data: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reorder tasks within a list or by status (for kanban)."""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="ids richiesti")
    for i, tid in enumerate(ids):
        task = await db.get(Task, tid)
        if task and task.created_by == user.id:
            task.position = i
    await db.commit()
    return {"detail": "Riordinato"}
