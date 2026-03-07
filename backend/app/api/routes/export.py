import csv
import io
import json
from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.task_list import TaskList
from app.models.habit import Habit, HabitLog

router = APIRouter()


def _serialize(val):
    if isinstance(val, (date, time)):
        return val.isoformat()
    return val


TASK_FIELDS = ["id", "title", "description", "list_id", "priority", "status", "due_date", "due_time"]
HABIT_FIELDS = ["id", "name", "description", "frequency_type", "frequency_days", "times_per_period", "start_date", "color"]


@router.get("/tasks")
async def export_tasks(
    fmt: str = Query("json", regex="^(json|csv)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task).where(Task.created_by == user.id).order_by(Task.id)
    )
    tasks = result.scalars().all()

    # Get list names for context
    lists_result = await db.execute(
        select(TaskList).where(TaskList.owner_id == user.id)
    )
    lists_map = {l.id: l.name for l in lists_result.scalars().all()}

    if fmt == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([*TASK_FIELDS, "list_name"])
        for t in tasks:
            writer.writerow([
                *[_serialize(getattr(t, f)) for f in TASK_FIELDS],
                lists_map.get(t.list_id, ""),
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=tasks.csv"},
        )

    data = []
    for t in tasks:
        row = {f: _serialize(getattr(t, f)) for f in TASK_FIELDS}
        row["list_name"] = lists_map.get(t.list_id, "")
        data.append(row)
    return StreamingResponse(
        iter([json.dumps(data, ensure_ascii=False, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=tasks.json"},
    )


@router.get("/habits")
async def export_habits(
    fmt: str = Query("json", regex="^(json|csv)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Habit).where(Habit.created_by == user.id).order_by(Habit.id)
    )
    habits = result.scalars().all()

    # Get logs too
    habit_ids = [h.id for h in habits]
    logs = []
    if habit_ids:
        logs_result = await db.execute(
            select(HabitLog).where(HabitLog.habit_id.in_(habit_ids)).order_by(HabitLog.log_date)
        )
        logs = logs_result.scalars().all()

    if fmt == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([*HABIT_FIELDS])
        for h in habits:
            writer.writerow([_serialize(getattr(h, f)) for f in HABIT_FIELDS])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=habits.csv"},
        )

    data = {
        "habits": [{f: _serialize(getattr(h, f)) for f in HABIT_FIELDS} for h in habits],
        "logs": [
            {"habit_id": l.habit_id, "log_date": l.log_date.isoformat(), "value": l.value, "note": l.note}
            for l in logs
        ],
    }
    return StreamingResponse(
        iter([json.dumps(data, ensure_ascii=False, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=habits.json"},
    )


class ImportResult(BaseModel):
    tasks_imported: int = 0
    habits_imported: int = 0
    errors: list[str] = []


@router.post("/import/tasks", response_model=ImportResult)
async def import_tasks(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import tasks from JSON file. Creates new tasks (ignores IDs)."""
    content = await file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="File JSON non valido")

    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="Il file deve contenere un array di task")

    # Get user's lists for mapping
    lists_result = await db.execute(
        select(TaskList).where(TaskList.owner_id == user.id)
    )
    lists_by_name = {l.name: l.id for l in lists_result.scalars().all()}

    imported = 0
    errors = []
    for i, item in enumerate(data):
        title = item.get("title")
        if not title:
            errors.append(f"Riga {i+1}: titolo mancante")
            continue

        # Resolve list
        list_id = None
        list_name = item.get("list_name")
        if list_name and list_name in lists_by_name:
            list_id = lists_by_name[list_name]
        elif item.get("list_id"):
            # Check if list_id exists and belongs to user
            existing = await db.get(TaskList, item["list_id"])
            if existing and existing.owner_id == user.id:
                list_id = existing.id

        if not list_id:
            # Use first list or create default
            if not lists_by_name:
                new_list = TaskList(name="Importati", owner_id=user.id, color="#6366F1")
                db.add(new_list)
                await db.flush()
                list_id = new_list.id
                lists_by_name["Importati"] = list_id
            else:
                list_id = next(iter(lists_by_name.values()))

        task = Task(
            title=title,
            description=item.get("description"),
            list_id=list_id,
            created_by=user.id,
            priority=min(max(int(item.get("priority", 4)), 1), 4),
            status=item.get("status", "todo"),
            due_date=date.fromisoformat(item["due_date"]) if item.get("due_date") else None,
        )
        db.add(task)
        imported += 1

    await db.commit()
    return ImportResult(tasks_imported=imported, errors=errors)
