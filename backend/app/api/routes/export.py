import csv
import io
import json
import re
import logging
from datetime import date, time, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.project import Project
from app.models.habit import Habit, HabitLog
from app.models.recurrence import RecurrenceRule
from app.models.tag import Tag, task_tags

logger = logging.getLogger(__name__)

router = APIRouter()


def _serialize(val):
    if isinstance(val, (date, time)):
        return val.isoformat()
    return val


TASK_FIELDS = ["id", "title", "description", "project_id", "priority", "status", "due_date", "due_time"]
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

    # Get project names for context
    projects_result = await db.execute(
        select(Project).where(Project.owner_id == user.id)
    )
    projects_map = {p.id: p.name for p in projects_result.scalars().all()}

    if fmt == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([*TASK_FIELDS, "project_name"])
        for t in tasks:
            writer.writerow([
                *[_serialize(getattr(t, f)) for f in TASK_FIELDS],
                projects_map.get(t.project_id, ""),
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
        row["project_name"] = projects_map.get(t.project_id, "")
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

    # Get user's projects for mapping
    projects_result = await db.execute(
        select(Project).where(Project.owner_id == user.id)
    )
    projects_by_name = {p.name: p.id for p in projects_result.scalars().all()}

    imported = 0
    errors = []
    for i, item in enumerate(data):
        title = item.get("title")
        if not title:
            errors.append(f"Riga {i+1}: titolo mancante")
            continue

        # Resolve project
        proj_id = None
        project_name = item.get("project_name")
        if project_name and project_name in projects_by_name:
            proj_id = projects_by_name[project_name]
        elif item.get("project_id"):
            # Check if project_id exists and belongs to user
            existing = await db.get(Project, item["project_id"])
            if existing and existing.owner_id == user.id:
                proj_id = existing.id

        if not proj_id:
            # Use first project or create default
            if not projects_by_name:
                new_project = Project(name="Importati", owner_id=user.id, color="#6366F1", project_type="personal", status="active")
                db.add(new_project)
                await db.flush()
                proj_id = new_project.id
                projects_by_name["Importati"] = proj_id
            else:
                proj_id = next(iter(projects_by_name.values()))

        task = Task(
            title=title,
            description=item.get("description"),
            project_id=proj_id,
            created_by=user.id,
            priority=min(max(int(item.get("priority", 4)), 1), 4),
            status=item.get("status", "todo"),
            due_date=date.fromisoformat(item["due_date"]) if item.get("due_date") else None,
        )
        db.add(task)
        imported += 1

    await db.commit()
    return ImportResult(tasks_imported=imported, errors=errors)


# ─── TickTick Import ────────────────────────────────────────────

TICKTICK_PRIORITY_MAP = {
    0: 4,  # None → Bassa
    1: 1,  # High → Urgente
    3: 2,  # Medium → Alta
    5: 3,  # Low → Media
}


def _parse_ticktick_date(val: str) -> tuple[date | None, time | None]:
    """Parse TickTick date format: 2023-12-25T14:30:00+0000"""
    if not val or not val.strip():
        return None, None
    val = val.strip().strip('"')
    # Try various formats
    for fmt in (
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            dt = datetime.strptime(val, fmt)
            return dt.date(), dt.time() if dt.hour or dt.minute else None
        except ValueError:
            continue
    # Handle +0000 without colon (Python < 3.12 compat)
    m = re.match(r"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})[+-]\d{4}$", val)
    if m:
        d = date.fromisoformat(m.group(1))
        t = time.fromisoformat(m.group(2))
        return d, t if t.hour or t.minute else None
    return None, None


def _find_header_row(lines: list[str]) -> int:
    """Find the CSV header row (skip TickTick metadata lines)."""
    for i, line in enumerate(lines):
        lower = line.lower()
        if "folder name" in lower or ("list name" in lower and "title" in lower):
            return i
    return 0


class TickTickImportResult(BaseModel):
    tasks_imported: int = 0
    subtasks_imported: int = 0
    projects_created: int = 0
    tags_created: int = 0
    recurrences_created: int = 0
    skipped: int = 0
    errors: list[str] = []


@router.post("/import/ticktick", response_model=TickTickImportResult)
async def import_ticktick(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import tasks from TickTick CSV backup."""
    content = await file.read()
    # Handle BOM
    text = content.decode("utf-8-sig")
    lines = text.splitlines()

    if len(lines) < 2:
        raise HTTPException(status_code=400, detail="File CSV vuoto o non valido")

    header_idx = _find_header_row(lines)
    csv_text = "\n".join(lines[header_idx:])
    reader = csv.DictReader(io.StringIO(csv_text))

    if not reader.fieldnames or "Title" not in reader.fieldnames:
        raise HTTPException(
            status_code=400,
            detail="Formato CSV non riconosciuto. Assicurati di esportare da TickTick > Settings > Backup.",
        )

    # Load existing projects
    projects_result = await db.execute(select(Project).where(Project.owner_id == user.id))
    projects_by_name: dict[str, int] = {p.name: p.id for p in projects_result.scalars().all()}

    # Load existing tags
    tags_result = await db.execute(select(Tag).where(Tag.user_id == user.id))
    tags_by_name: dict[str, Tag] = {t.name.lower(): t for t in tags_result.scalars().all()}

    result = TickTickImportResult()
    # Map TickTick taskId → our Task for subtask linking
    ticktick_id_map: dict[str, Task] = {}
    # Deferred subtasks (parentId → list of rows)
    deferred_subtasks: list[dict] = []
    # Deferred recurrences (task → rrule string)
    deferred_recurrences: list[tuple[Task, str]] = []
    # Deferred tags (task → list of tag names)
    deferred_tags: list[tuple[Task, list[str]]] = []

    rows = list(reader)

    for i, row in enumerate(rows):
        try:
            title = (row.get("Title") or "").strip()
            if not title:
                result.skipped += 1
                continue

            # Check if subtask
            parent_id_str = (row.get("parentId") or "").strip()
            if parent_id_str and parent_id_str != "0":
                deferred_subtasks.append(row)
                continue

            # Resolve project
            list_name = (row.get("List Name") or "").strip() or "Importati"
            if list_name not in projects_by_name:
                new_project = Project(name=list_name, owner_id=user.id, color="#6366F1", project_type="personal", status="active")
                db.add(new_project)
                await db.flush()
                projects_by_name[list_name] = new_project.id
                result.projects_created += 1

            proj_id = projects_by_name[list_name]

            # Priority
            tt_priority = int(row.get("Priority") or 0)
            priority = TICKTICK_PRIORITY_MAP.get(tt_priority, 4)

            # Status
            tt_status = int(row.get("Status") or 0)
            if tt_status == 0:
                status = TaskStatus.TODO
            else:
                status = TaskStatus.DONE

            # Dates
            due_date, due_time = _parse_ticktick_date(row.get("Due Date") or "")

            # Completed time
            completed_at = None
            if status == TaskStatus.DONE:
                comp_date, comp_time = _parse_ticktick_date(row.get("Completed Time") or "")
                if comp_date:
                    completed_at = datetime.combine(
                        comp_date, comp_time or time(0, 0), tzinfo=timezone.utc
                    )

            # Description: convert checklist markers to plain text
            content = (row.get("Content") or "").strip()
            if content:
                content = content.replace("▪", "- [x]").replace("▫", "- [ ]")

            # Kanban column → status mapping
            column = (row.get("Column Name") or "").strip().lower()
            if column and status != TaskStatus.DONE:
                if column in ("in progress", "doing", "in corso"):
                    status = TaskStatus.DOING

            task = Task(
                title=title[:500],
                description=content[:5000] if content else None,
                project_id=proj_id,
                created_by=user.id,
                priority=priority,
                status=status,
                due_date=due_date,
                due_time=due_time,
                completed_at=completed_at,
            )
            db.add(task)
            await db.flush()

            ticktick_id = (row.get("taskId") or "").strip()
            if ticktick_id:
                ticktick_id_map[ticktick_id] = task

            # Collect tags
            tags_str = (row.get("Tags") or "").strip()
            if tags_str:
                tag_names = [t.strip() for t in tags_str.split(",") if t.strip()]
                if tag_names:
                    deferred_tags.append((task, tag_names))

            # Collect recurrence
            repeat = (row.get("Repeat") or "").strip()
            if repeat:
                deferred_recurrences.append((task, repeat))

            result.tasks_imported += 1

        except Exception as e:
            result.errors.append(f"Riga {i+1}: {str(e)[:100]}")
            if len(result.errors) > 50:
                result.errors.append("... troppi errori, import interrotto")
                break

    # Process subtasks
    for row in deferred_subtasks:
        try:
            title = (row.get("Title") or "").strip()
            parent_id_str = (row.get("parentId") or "").strip()
            parent_task = ticktick_id_map.get(parent_id_str)
            if not parent_task:
                # Parent not found, create as top-level task
                list_name = (row.get("List Name") or "").strip() or "Importati"
                proj_id = projects_by_name.get(list_name, next(iter(projects_by_name.values())))
                task = Task(
                    title=title[:500], project_id=proj_id, created_by=user.id,
                    priority=TICKTICK_PRIORITY_MAP.get(int(row.get("Priority") or 0), 4),
                    status=TaskStatus.DONE if int(row.get("Status") or 0) > 0 else TaskStatus.TODO,
                )
                db.add(task)
                result.tasks_imported += 1
                continue

            tt_status = int(row.get("Status") or 0)
            subtask = Task(
                title=title[:500],
                project_id=parent_task.project_id,
                created_by=user.id,
                parent_id=parent_task.id,
                priority=TICKTICK_PRIORITY_MAP.get(int(row.get("Priority") or 0), 4),
                status=TaskStatus.DONE if tt_status > 0 else TaskStatus.TODO,
                completed_at=datetime.now(timezone.utc) if tt_status > 0 else None,
            )
            db.add(subtask)
            result.subtasks_imported += 1
        except Exception as e:
            result.errors.append(f"Subtask '{title[:30]}': {str(e)[:100]}")

    # Process tags
    TAG_COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"]
    for task, tag_names in deferred_tags:
        for tag_name in tag_names:
            key = tag_name.lower()
            if key not in tags_by_name:
                color = TAG_COLORS[len(tags_by_name) % len(TAG_COLORS)]
                new_tag = Tag(name=tag_name[:50], color=color, user_id=user.id)
                db.add(new_tag)
                await db.flush()
                tags_by_name[key] = new_tag
                result.tags_created += 1
            tag = tags_by_name[key]
            await db.execute(task_tags.insert().values(task_id=task.id, tag_id=tag.id))

    # Process recurrences
    for task, rrule_str in deferred_recurrences:
        try:
            # Clean up RRULE string
            rrule = rrule_str.strip()
            if not rrule.startswith("RRULE:"):
                rrule = f"RRULE:{rrule}"
            rec = RecurrenceRule(task_id=task.id, rrule=rrule)
            db.add(rec)
            result.recurrences_created += 1
        except Exception as e:
            result.errors.append(f"Ricorrenza task '{task.title[:30]}': {str(e)[:100]}")

    await db.commit()
    return result
