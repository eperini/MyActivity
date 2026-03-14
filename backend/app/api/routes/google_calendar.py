from datetime import date, timedelta, datetime as dt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.project import Project

router = APIRouter()


class CalendarConfig(BaseModel):
    calendar_id: str


@router.get("/calendars")
async def get_calendars(user: User = Depends(get_current_user)):
    """List calendars accessible by the service account."""
    try:
        from app.services.google_calendar import list_calendars
        return list_calendars()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config")
async def get_config(user: User = Depends(get_current_user)):
    """Get current Google Calendar configuration."""
    return {
        "calendar_id": settings.GOOGLE_CALENDAR_ID,
        "sync_project_id": settings.GOOGLE_SYNC_PROJECT_ID,
        "configured": bool(settings.GOOGLE_CALENDAR_ID and settings.GOOGLE_SYNC_PROJECT_ID),
    }


@router.post("/sync")
async def trigger_sync(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Push all tasks with due_date to Google Calendar and pull new events."""
    if not settings.GOOGLE_CALENDAR_ID:
        raise HTTPException(status_code=400, detail="Google Calendar non configurato")

    from app.services.google_calendar import push_task_to_calendar, fetch_calendar_events

    sync_project_id = settings.GOOGLE_SYNC_PROJECT_ID
    if not sync_project_id:
        raise HTTPException(status_code=400, detail="Progetto di sincronizzazione non configurato")

    # --- Push: Zeno → Google ---
    result = await db.execute(
        select(Task).where(
            Task.project_id == sync_project_id,
            Task.due_date.isnot(None),
        )
    )
    tasks = result.scalars().all()
    pushed = 0
    for task in tasks:
        try:
            event_id = push_task_to_calendar(task)
            if event_id and event_id != task.google_event_id:
                task.google_event_id = event_id
                pushed += 1
        except Exception as e:
            print(f"Error pushing task {task.id}: {e}")

    await db.commit()

    # --- Pull: Google → Zeno ---
    pulled = 0
    try:
        events = fetch_calendar_events(days_back=7, days_forward=60)
        # Get existing google_event_ids
        existing_result = await db.execute(
            select(Task.google_event_id).where(
                Task.project_id == sync_project_id,
                Task.google_event_id.isnot(None),
            )
        )
        existing_event_ids = set(existing_result.scalars().all())

        # Use the sync project
        sync_project = await db.get(Project, sync_project_id)
        if not sync_project:
            return {"pushed": pushed, "pulled": 0, "detail": "Progetto sync non trovato"}

        # For recurring events, keep only the next occurrence (closest to today)
        today = date.today()
        recurring_best: dict[str, dict] = {}  # recurringEventId -> best event
        single_events: list[dict] = []

        for event in events:
            if event.get("status") == "cancelled":
                continue
            event_id = event.get("id")
            if not event_id or event_id in existing_event_ids:
                continue

            # Skip events created by Zeno
            ext_props = event.get("extendedProperties", {}).get("private", {})
            if ext_props.get("zeno_task_id") or ext_props.get("myactivity_task_id"):
                continue

            recurring_id = event.get("recurringEventId")
            if recurring_id:
                # Also skip if we already have any instance of this recurring event
                # Check by recurringEventId prefix in existing event ids
                # Parse event date for comparison
                start = event.get("start", {})
                event_date = None
                if "date" in start:
                    event_date = date.fromisoformat(start["date"])
                elif "dateTime" in start:
                    event_date = dt.fromisoformat(start["dateTime"]).date()

                if event_date and event_date >= today:
                    prev = recurring_best.get(recurring_id)
                    if prev is None:
                        recurring_best[recurring_id] = event
                    else:
                        # Keep the one closest to today (earliest future)
                        prev_start = prev.get("start", {})
                        prev_date = None
                        if "date" in prev_start:
                            prev_date = date.fromisoformat(prev_start["date"])
                        elif "dateTime" in prev_start:
                            prev_date = dt.fromisoformat(prev_start["dateTime"]).date()
                        if prev_date and event_date < prev_date:
                            recurring_best[recurring_id] = event
            else:
                single_events.append(event)

        # Also check if any recurring event's base ID is already imported
        existing_titles_dates = set()
        if recurring_best:
            title_result = await db.execute(
                select(Task.title, Task.due_date).where(
                    Task.project_id == sync_project_id,
                )
            )
            existing_titles_dates = {(r[0], r[1]) for r in title_result.all()}

        # Combine: single events + best occurrence of each recurring event
        events_to_import = single_events + list(recurring_best.values())

        for event in events_to_import:
            summary = event.get("summary", "Evento senza titolo")
            description = event.get("description", "")

            # Parse date
            start = event.get("start", {})
            due_date = None
            due_time = None
            if "date" in start:
                due_date = date.fromisoformat(start["date"])
            elif "dateTime" in start:
                parsed = dt.fromisoformat(start["dateTime"])
                due_date = parsed.date()
                due_time = parsed.time()

            # Skip if we already have a task with same title and date
            if (summary, due_date) in existing_titles_dates:
                continue

            task = Task(
                title=summary,
                description=description if description else None,
                project_id=sync_project.id,
                created_by=sync_project.owner_id,
                due_date=due_date,
                due_time=due_time,
                google_event_id=event.get("id"),
                priority=4,
            )
            db.add(task)
            pulled += 1

        await db.commit()
    except Exception as e:
        print(f"Error pulling events: {e}")

    return {"pushed": pushed, "pulled": pulled}
