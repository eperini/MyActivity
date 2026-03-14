from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.dependency import TaskDependency, DependencyType
from app.api.routes.access import _check_task_access

router = APIRouter()


class DependencyCreate(BaseModel):
    related_task_id: int
    dependency_type: str = Field(default="blocks", pattern=r"^(blocks|relates_to|duplicates)$")


class DependencyItem(BaseModel):
    id: int
    task_id: int
    title: str
    status: str
    dependency_type: str


class DependencyResponse(BaseModel):
    blocking: list[DependencyItem] = []
    blocked_by: list[DependencyItem] = []
    relates_to: list[DependencyItem] = []


async def _get_task_with_access(task_id: int, user: User, db: AsyncSession) -> Task:
    """Fetch task and verify user has access to its list."""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    await _check_task_access(task, user.id, db)
    return task


@router.get("/tasks/{task_id}/dependencies", response_model=DependencyResponse)
async def get_dependencies(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_task_with_access(task_id, user, db)

    # Tasks this task blocks (this task is blocking_task)
    blocking_result = await db.execute(
        select(TaskDependency, Task.title, Task.status)
        .join(Task, TaskDependency.blocked_task_id == Task.id)
        .where(
            TaskDependency.blocking_task_id == task_id,
            TaskDependency.dependency_type == DependencyType.BLOCKS,
        )
    )
    blocking = [
        DependencyItem(
            id=dep.id,
            task_id=dep.blocked_task_id,
            title=title,
            status=status.value,
            dependency_type=dep.dependency_type.value,
        )
        for dep, title, status in blocking_result.all()
    ]

    # Tasks blocking this task (this task is blocked_task)
    blocked_by_result = await db.execute(
        select(TaskDependency, Task.title, Task.status)
        .join(Task, TaskDependency.blocking_task_id == Task.id)
        .where(
            TaskDependency.blocked_task_id == task_id,
            TaskDependency.dependency_type == DependencyType.BLOCKS,
        )
    )
    blocked_by = [
        DependencyItem(
            id=dep.id,
            task_id=dep.blocking_task_id,
            title=title,
            status=status.value,
            dependency_type=dep.dependency_type.value,
        )
        for dep, title, status in blocked_by_result.all()
    ]

    # Relates_to / duplicates (both directions)
    relates_result = await db.execute(
        select(TaskDependency, Task.id, Task.title, Task.status)
        .join(
            Task,
            or_(
                and_(
                    TaskDependency.blocking_task_id == task_id,
                    Task.id == TaskDependency.blocked_task_id,
                ),
                and_(
                    TaskDependency.blocked_task_id == task_id,
                    Task.id == TaskDependency.blocking_task_id,
                ),
            ),
        )
        .where(
            or_(
                TaskDependency.blocking_task_id == task_id,
                TaskDependency.blocked_task_id == task_id,
            ),
            TaskDependency.dependency_type.in_([
                DependencyType.RELATES_TO,
                DependencyType.DUPLICATES,
            ]),
        )
    )
    relates_to = [
        DependencyItem(
            id=dep.id,
            task_id=related_id,
            title=title,
            status=status.value,
            dependency_type=dep.dependency_type.value,
        )
        for dep, related_id, title, status in relates_result.all()
    ]

    return DependencyResponse(
        blocking=blocking,
        blocked_by=blocked_by,
        relates_to=relates_to,
    )


@router.post("/tasks/{task_id}/dependencies", response_model=DependencyItem)
async def create_dependency(
    task_id: int,
    data: DependencyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await _get_task_with_access(task_id, user, db)

    # Verify related task exists and user has access
    related_task = await _get_task_with_access(data.related_task_id, user, db)

    if task_id == data.related_task_id:
        raise HTTPException(status_code=422, detail="Un task non può dipendere da sé stesso")

    dep_type = DependencyType(data.dependency_type)

    # For "blocks" type, task_id blocks related_task_id
    # blocking_task_id = task_id, blocked_task_id = related_task_id
    if dep_type == DependencyType.BLOCKS:
        blocking_id = task_id
        blocked_id = data.related_task_id
    else:
        # For relates_to/duplicates, order doesn't matter semantically
        # Use consistent ordering (lower id as blocking)
        blocking_id = min(task_id, data.related_task_id)
        blocked_id = max(task_id, data.related_task_id)

    # Check for existing dependency
    existing = await db.execute(
        select(TaskDependency).where(
            TaskDependency.blocking_task_id == blocking_id,
            TaskDependency.blocked_task_id == blocked_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Dipendenza già esistente")

    # Cycle detection for "blocks" type
    if dep_type == DependencyType.BLOCKS:
        cycle_query = text("""
            WITH RECURSIVE chain AS (
                SELECT blocked_task_id AS tid FROM task_dependencies
                WHERE blocking_task_id = :new_blocked_id AND dependency_type = 'blocks'
                UNION ALL
                SELECT td.blocked_task_id FROM task_dependencies td
                JOIN chain c ON td.blocking_task_id = c.tid
                WHERE td.dependency_type = 'blocks'
            )
            SELECT 1 FROM chain WHERE tid = :new_blocking_id LIMIT 1;
        """)
        cycle_result = await db.execute(
            cycle_query,
            {"new_blocked_id": blocked_id, "new_blocking_id": blocking_id},
        )
        if cycle_result.scalar_one_or_none():
            raise HTTPException(status_code=422, detail="Dipendenza circolare rilevata")

    dep = TaskDependency(
        blocking_task_id=blocking_id,
        blocked_task_id=blocked_id,
        dependency_type=dep_type,
        created_by=user.id,
    )
    db.add(dep)
    await db.commit()
    await db.refresh(dep)

    # Return the related task info
    return DependencyItem(
        id=dep.id,
        task_id=data.related_task_id,
        title=related_task.title,
        status=related_task.status.value,
        dependency_type=dep.dependency_type.value,
    )


@router.delete("/tasks/{task_id}/dependencies/{dep_id}")
async def delete_dependency(
    task_id: int,
    dep_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_task_with_access(task_id, user, db)

    dep = await db.get(TaskDependency, dep_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dipendenza non trovata")

    # Verify dependency belongs to this task
    if dep.blocking_task_id != task_id and dep.blocked_task_id != task_id:
        raise HTTPException(status_code=404, detail="Dipendenza non trovata")

    await db.delete(dep)
    await db.commit()
    return {"detail": "Dipendenza eliminata"}
