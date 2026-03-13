from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.task_list import TaskList, ListMember
from app.models.time_log import TimeLog
from app.models.tempo import TempoUser
from app.models.project import Project
from app.models.epic import Epic

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────

def format_minutes(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    if h and m:
        return f"{h}h {m}m"
    elif h:
        return f"{h}h"
    return f"{m}m"


async def _check_task_access(task_id: int, user_id: int, db: AsyncSession) -> Task:
    """Verify task exists and user has access."""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    # Check list access
    task_list = await db.get(TaskList, task.list_id)
    if not task_list:
        raise HTTPException(status_code=404, detail="Lista non trovata")
    if task_list.owner_id != user_id:
        member = await db.execute(
            select(ListMember).where(
                ListMember.list_id == task.list_id,
                ListMember.user_id == user_id,
            )
        )
        if not member.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Non hai accesso a questo task")
    return task


# ── Schemas ──────────────────────────────────────────────────────────

class TimeLogCreate(BaseModel):
    minutes: int = Field(..., gt=0, le=1440)
    logged_at: date = Field(default_factory=date.today)
    note: str | None = Field(None, max_length=500)


class TimeLogUpdate(BaseModel):
    minutes: int | None = Field(None, gt=0, le=1440)
    logged_at: date | None = None
    note: str | None = Field(None, max_length=500)


class TimeLogOut(BaseModel):
    id: int
    task_id: int
    user_id: int | None
    user_name: str
    logged_at: date
    minutes: int
    formatted: str
    note: str | None
    source: str = "manual"
    tempo_push_status: str | None = None
    tempo_push_error: str | None = None
    jira_issue_key: str | None = None
    created_at: str

    class Config:
        from_attributes = True


# ── Task Time Log CRUD ───────────────────────────────────────────────

@router.get("/tasks/{task_id}/time", response_model=list[TimeLogOut])
async def get_task_time_logs(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_task_access(task_id, user.id, db)
    task_obj = await db.get(Task, task_id)
    jira_key = task_obj.jira_issue_key if task_obj else None
    result = await db.execute(
        select(TimeLog, User.display_name, TempoUser.display_name)
        .outerjoin(User, TimeLog.user_id == User.id)
        .outerjoin(TempoUser, TimeLog.tempo_user_id == TempoUser.id)
        .where(TimeLog.task_id == task_id)
        .order_by(TimeLog.logged_at.desc(), TimeLog.created_at.desc())
    )
    rows = result.all()
    return [
        TimeLogOut(
            id=log.id,
            task_id=log.task_id,
            user_id=log.user_id,
            user_name=user_name or tempo_name or "Utente sconosciuto",
            logged_at=log.logged_at,
            minutes=log.minutes,
            formatted=format_minutes(log.minutes),
            note=log.note,
            source=log.source or "manual",
            tempo_push_status=log.tempo_push_status,
            tempo_push_error=log.tempo_push_error,
            jira_issue_key=jira_key,
            created_at=log.created_at.isoformat(),
        )
        for log, user_name, tempo_name in rows
    ]


@router.post("/tasks/{task_id}/time", response_model=TimeLogOut)
async def create_time_log(
    task_id: int,
    data: TimeLogCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_task_access(task_id, user.id, db)
    log = TimeLog(
        task_id=task_id,
        user_id=user.id,
        logged_at=data.logged_at,
        minutes=data.minutes,
        note=data.note,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return TimeLogOut(
        id=log.id,
        task_id=log.task_id,
        user_id=log.user_id,
        user_name=user.display_name,
        logged_at=log.logged_at,
        minutes=log.minutes,
        formatted=format_minutes(log.minutes),
        note=log.note,
        created_at=log.created_at.isoformat(),
    )


@router.patch("/tasks/{task_id}/time/{log_id}", response_model=TimeLogOut)
async def update_time_log(
    task_id: int,
    log_id: int,
    data: TimeLogUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_task_access(task_id, user.id, db)
    log = await db.get(TimeLog, log_id)
    if not log or log.task_id != task_id:
        raise HTTPException(status_code=404, detail="Log non trovato")
    if log.user_id != user.id:
        raise HTTPException(status_code=403, detail="Puoi modificare solo i tuoi log")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(log, field, value)
    await db.commit()
    await db.refresh(log)
    return TimeLogOut(
        id=log.id,
        task_id=log.task_id,
        user_id=log.user_id,
        user_name=user.display_name,
        logged_at=log.logged_at,
        minutes=log.minutes,
        formatted=format_minutes(log.minutes),
        note=log.note,
        created_at=log.created_at.isoformat(),
    )


@router.delete("/tasks/{task_id}/time/{log_id}")
async def delete_time_log(
    task_id: int,
    log_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_task_access(task_id, user.id, db)
    log = await db.get(TimeLog, log_id)
    if not log or log.task_id != task_id:
        raise HTTPException(status_code=404, detail="Log non trovato")
    if log.user_id != user.id:
        raise HTTPException(status_code=403, detail="Puoi eliminare solo i tuoi log")
    await db.delete(log)
    await db.commit()
    return {"detail": "Log eliminato"}


# ── Report endpoints ─────────────────────────────────────────────────

@router.get("/time/week")
async def get_weekly_time(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    week_start = today - timedelta(days=today.weekday())  # Monday
    week_end = week_start + timedelta(days=6)  # Sunday

    # All logs for the week (task logs + epic logs)
    task_result = await db.execute(
        select(TimeLog, Task.title, Task.project_id)
        .join(Task, TimeLog.task_id == Task.id)
        .where(
            TimeLog.user_id == user.id,
            TimeLog.logged_at >= week_start,
            TimeLog.logged_at <= week_end,
        )
        .order_by(TimeLog.logged_at)
    )
    epic_result = await db.execute(
        select(TimeLog, Epic.name, Epic.project_id)
        .join(Epic, TimeLog.epic_id == Epic.id)
        .where(
            TimeLog.user_id == user.id,
            TimeLog.logged_at >= week_start,
            TimeLog.logged_at <= week_end,
        )
        .order_by(TimeLog.logged_at)
    )
    rows = task_result.all() + epic_result.all()

    total_minutes = sum(log.minutes for log, _, _ in rows)

    # Group by project
    by_project: dict[int | None, dict] = {}
    for log, item_title, project_id in rows:
        if project_id not in by_project:
            by_project[project_id] = {
                "project_id": project_id,
                "project_name": None,
                "minutes": 0,
                "logs": [],
            }
        by_project[project_id]["minutes"] += log.minutes
        by_project[project_id]["logs"].append({
            "task_id": log.task_id,
            "epic_id": log.epic_id,
            "task_title": item_title,
            "minutes": log.minutes,
            "logged_at": log.logged_at.isoformat(),
            "note": log.note,
        })

    # Fetch project names
    project_ids = [pid for pid in by_project if pid is not None]
    if project_ids:
        proj_result = await db.execute(
            select(Project.id, Project.name).where(Project.id.in_(project_ids))
        )
        proj_names = {row.id: row.name for row in proj_result.all()}
        for pid, data in by_project.items():
            if pid is not None:
                data["project_name"] = proj_names.get(pid, "Progetto sconosciuto")
            else:
                data["project_name"] = "Senza progetto"
    else:
        for data in by_project.values():
            data["project_name"] = "Senza progetto"

    # Format project totals
    for data in by_project.values():
        data["formatted"] = format_minutes(data["minutes"])

    # Group by day
    by_day: dict[str, int] = {}
    for log, _, _ in rows:
        day_str = log.logged_at.isoformat()
        by_day[day_str] = by_day.get(day_str, 0) + log.minutes

    by_day_list = [
        {"date": d, "minutes": m, "formatted": format_minutes(m)}
        for d, m in sorted(by_day.items())
    ]

    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "total_minutes": total_minutes,
        "total_formatted": format_minutes(total_minutes),
        "by_project": sorted(by_project.values(), key=lambda x: x["minutes"], reverse=True),
        "by_day": by_day_list,
    }


@router.get("/time/report")
async def get_time_report(
    user_id: int | None = Query(None),
    project_id: int | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    group_by: str = Query("day", pattern="^(day|week|project|task)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_user_id = user_id or user.id
    # Only admin can view other users' reports
    if target_user_id != user.id and not user.is_admin:
        raise HTTPException(403, "Non puoi visualizzare i report di altri utenti")

    # Task logs
    task_query = (
        select(TimeLog, Task.title, Task.project_id)
        .join(Task, TimeLog.task_id == Task.id)
        .where(TimeLog.user_id == target_user_id)
    )
    if project_id:
        task_query = task_query.where(Task.project_id == project_id)
    if date_from:
        task_query = task_query.where(TimeLog.logged_at >= date_from)
    if date_to:
        task_query = task_query.where(TimeLog.logged_at <= date_to)

    # Epic logs
    epic_query = (
        select(TimeLog, Epic.name, Epic.project_id)
        .join(Epic, TimeLog.epic_id == Epic.id)
        .where(TimeLog.user_id == target_user_id)
    )
    if project_id:
        epic_query = epic_query.where(Epic.project_id == project_id)
    if date_from:
        epic_query = epic_query.where(TimeLog.logged_at >= date_from)
    if date_to:
        epic_query = epic_query.where(TimeLog.logged_at <= date_to)

    task_result = await db.execute(task_query.order_by(TimeLog.logged_at))
    epic_result = await db.execute(epic_query.order_by(TimeLog.logged_at))
    rows = task_result.all() + epic_result.all()

    total_minutes = sum(log.minutes for log, _, _ in rows)

    if group_by == "day":
        grouped: dict[str, int] = {}
        for log, _, _ in rows:
            key = log.logged_at.isoformat()
            grouped[key] = grouped.get(key, 0) + log.minutes
        items = [
            {"date": k, "minutes": v, "formatted": format_minutes(v)}
            for k, v in sorted(grouped.items())
        ]
    elif group_by == "project":
        grouped = {}
        for log, _, proj_id in rows:
            key = proj_id or 0
            grouped[key] = grouped.get(key, 0) + log.minutes
        # Fetch names
        proj_ids = [k for k in grouped if k != 0]
        proj_names = {}
        if proj_ids:
            pr = await db.execute(select(Project.id, Project.name).where(Project.id.in_(proj_ids)))
            proj_names = {row.id: row.name for row in pr.all()}
        items = [
            {
                "project_id": k if k != 0 else None,
                "project_name": proj_names.get(k, "Senza progetto") if k != 0 else "Senza progetto",
                "minutes": v,
                "formatted": format_minutes(v),
            }
            for k, v in sorted(grouped.items(), key=lambda x: x[1], reverse=True)
        ]
    elif group_by == "task":
        grouped = {}
        item_names = {}
        for log, title, _ in rows:
            # Use task_id or "epic-{epic_id}" as key
            key = log.task_id if log.task_id else f"epic-{log.epic_id}"
            grouped[key] = grouped.get(key, 0) + log.minutes
            item_names[key] = title
        items = [
            {
                "task_id": k if isinstance(k, int) else None,
                "epic_id": int(k.split("-")[1]) if isinstance(k, str) and k.startswith("epic-") else None,
                "task_title": item_names[k],
                "minutes": v,
                "formatted": format_minutes(v),
            }
            for k, v in sorted(grouped.items(), key=lambda x: x[1], reverse=True)
        ]
    else:  # week
        grouped = {}
        for log, _, _ in rows:
            # ISO week start (Monday)
            week_start = log.logged_at - timedelta(days=log.logged_at.weekday())
            key = week_start.isoformat()
            grouped[key] = grouped.get(key, 0) + log.minutes
        items = [
            {"week_start": k, "minutes": v, "formatted": format_minutes(v)}
            for k, v in sorted(grouped.items())
        ]

    return {
        "total_minutes": total_minutes,
        "total_formatted": format_minutes(total_minutes),
        "group_by": group_by,
        "items": items,
    }


@router.get("/time/export")
async def export_time(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    fmt: str = Query("csv", pattern="^(csv|json)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(TimeLog, Task.title, User.display_name)
        .join(Task, TimeLog.task_id == Task.id)
        .join(User, TimeLog.user_id == User.id)
        .where(TimeLog.user_id == user.id)
    )
    if date_from:
        query = query.where(TimeLog.logged_at >= date_from)
    if date_to:
        query = query.where(TimeLog.logged_at <= date_to)

    result = await db.execute(query.order_by(TimeLog.logged_at))
    rows = result.all()

    if fmt == "json":
        from fastapi.responses import JSONResponse
        data = [
            {
                "id": log.id,
                "task_id": log.task_id,
                "task_title": title,
                "user": name,
                "logged_at": log.logged_at.isoformat(),
                "minutes": log.minutes,
                "formatted": format_minutes(log.minutes),
                "note": log.note,
            }
            for log, title, name in rows
        ]
        return JSONResponse(content=data)

    # CSV
    from fastapi.responses import StreamingResponse
    import io

    output = io.StringIO()
    output.write("date,task,minutes,hours,note\n")
    for log, title, _ in rows:
        safe_title = title.replace('"', '""')
        safe_note = (log.note or "").replace('"', '""')
        hours = round(log.minutes / 60, 2)
        output.write(f'{log.logged_at},"{safe_title}",{log.minutes},{hours},"{safe_note}"\n')

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=time_export.csv"},
    )
