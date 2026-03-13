from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, case, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.sprint import Sprint, SprintStatus, sprint_tasks
from app.api.routes.projects import _check_project_access, _check_project_owner
from app.api.routes.tasks import _check_task_access

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────

class SprintCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    goal: str | None = Field(default=None, max_length=5000)
    start_date: date
    end_date: date


class SprintUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    goal: str | None = Field(default=None, max_length=5000)
    start_date: date | None = None
    end_date: date | None = None
    status: SprintStatus | None = None


class SprintResponse(BaseModel):
    id: int
    project_id: int
    name: str
    goal: str | None
    start_date: date
    end_date: date
    status: SprintStatus
    task_count: int = 0
    completed_count: int = 0

    class Config:
        from_attributes = True


class SprintTaskRequest(BaseModel):
    task_id: int


# ─── Helpers ──────────────────────────────────────────

async def _get_sprint(sprint_id: int, project_id: int, db: AsyncSession) -> Sprint:
    sprint = await db.get(Sprint, sprint_id)
    if not sprint or sprint.project_id != project_id:
        raise HTTPException(status_code=404, detail="Sprint non trovato")
    return sprint


async def _sprint_task_counts(sprint_ids: list[int], db: AsyncSession) -> dict[int, tuple[int, int]]:
    if not sprint_ids:
        return {}
    result = await db.execute(
        select(
            sprint_tasks.c.sprint_id,
            func.count().label("total"),
            func.count(case((Task.status == TaskStatus.DONE, 1))).label("done"),
        )
        .join(Task, sprint_tasks.c.task_id == Task.id)
        .where(sprint_tasks.c.sprint_id.in_(sprint_ids))
        .group_by(sprint_tasks.c.sprint_id)
    )
    return {row.sprint_id: (row.total, row.done) for row in result.all()}


def _to_response(sprint: Sprint, counts: dict[int, tuple[int, int]]) -> SprintResponse:
    total, done = counts.get(sprint.id, (0, 0))
    return SprintResponse(
        id=sprint.id,
        project_id=sprint.project_id,
        name=sprint.name,
        goal=sprint.goal,
        start_date=sprint.start_date,
        end_date=sprint.end_date,
        status=sprint.status,
        task_count=total,
        completed_count=done,
    )


# ─── Endpoints ────────────────────────────────────────

@router.get("/projects/{project_id}/sprints/", response_model=list[SprintResponse])
async def list_sprints(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)

    result = await db.execute(
        select(Sprint)
        .where(Sprint.project_id == project_id)
        .order_by(Sprint.start_date.desc())
    )
    sprints = result.scalars().all()

    counts = await _sprint_task_counts([s.id for s in sprints], db)
    return [_to_response(s, counts) for s in sprints]


@router.post("/projects/{project_id}/sprints/", response_model=SprintResponse)
async def create_sprint(
    project_id: int,
    data: SprintCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)

    if data.end_date <= data.start_date:
        raise HTTPException(status_code=400, detail="end_date deve essere successiva a start_date")

    sprint = Sprint(
        project_id=project_id,
        name=data.name,
        goal=data.goal,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(sprint)
    await db.commit()
    await db.refresh(sprint)

    return _to_response(sprint, {})


@router.get("/projects/{project_id}/sprints/{sprint_id}")
async def get_sprint_detail(
    project_id: int,
    sprint_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    sprint = await _get_sprint(sprint_id, project_id, db)

    # Get tasks in sprint
    task_result = await db.execute(
        select(Task)
        .join(sprint_tasks, sprint_tasks.c.task_id == Task.id)
        .where(sprint_tasks.c.sprint_id == sprint_id)
        .order_by(Task.priority, Task.due_date)
    )
    tasks = task_result.scalars().all()

    total = len(tasks)
    completed = sum(1 for t in tasks if t.status == TaskStatus.DONE)
    today = date.today()
    days_remaining = max((sprint.end_date - today).days, 0) if sprint.end_date >= today else 0

    return {
        "sprint": SprintResponse(
            id=sprint.id,
            project_id=sprint.project_id,
            name=sprint.name,
            goal=sprint.goal,
            start_date=sprint.start_date,
            end_date=sprint.end_date,
            status=sprint.status,
            task_count=total,
            completed_count=completed,
        ),
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "assigned_to": t.assigned_to,
                "due_date": t.due_date,
            }
            for t in tasks
        ],
        "metrics": {
            "total_tasks": total,
            "completed_tasks": completed,
            "completion_pct": round(completed / total * 100, 1) if total > 0 else 0,
            "days_remaining": days_remaining,
        },
    }


@router.patch("/projects/{project_id}/sprints/{sprint_id}", response_model=SprintResponse)
async def update_sprint(
    project_id: int,
    sprint_id: int,
    data: SprintUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)
    sprint = await _get_sprint(sprint_id, project_id, db)

    update_data = data.model_dump(exclude_unset=True)

    # Validate date range if either date is being updated
    new_start = update_data.get("start_date", sprint.start_date)
    new_end = update_data.get("end_date", sprint.end_date)
    if new_end <= new_start:
        raise HTTPException(status_code=400, detail="end_date deve essere successiva a start_date")

    for field, value in update_data.items():
        setattr(sprint, field, value)
    await db.commit()
    await db.refresh(sprint)

    counts = await _sprint_task_counts([sprint.id], db)
    return _to_response(sprint, counts)


@router.post("/projects/{project_id}/sprints/{sprint_id}/tasks")
async def add_task_to_sprint(
    project_id: int,
    sprint_id: int,
    data: SprintTaskRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)
    sprint = await _get_sprint(sprint_id, project_id, db)

    # Verify task exists and belongs to this project
    task = await db.get(Task, data.task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task non trovato in questo progetto")

    # Verify user has access to the task
    await _check_task_access(task, user.id, db)

    # Check if already in sprint
    existing = await db.execute(
        select(sprint_tasks).where(
            sprint_tasks.c.sprint_id == sprint_id,
            sprint_tasks.c.task_id == data.task_id,
        )
    )
    if existing.first():
        raise HTTPException(status_code=400, detail="Task già presente nello sprint")

    await db.execute(sprint_tasks.insert().values(sprint_id=sprint_id, task_id=data.task_id))
    await db.commit()
    return {"detail": "Task aggiunto allo sprint"}


@router.delete("/projects/{project_id}/sprints/{sprint_id}/tasks/{task_id}")
async def remove_task_from_sprint(
    project_id: int,
    sprint_id: int,
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)
    await _get_sprint(sprint_id, project_id, db)

    result = await db.execute(
        delete(sprint_tasks).where(
            sprint_tasks.c.sprint_id == sprint_id,
            sprint_tasks.c.task_id == task_id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Task non trovato nello sprint")

    await db.commit()
    return {"detail": "Task rimosso dallo sprint"}
