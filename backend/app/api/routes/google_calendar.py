from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.task_list import TaskList

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
        "sync_list_id": settings.GOOGLE_SYNC_LIST_ID,
        "configured": bool(settings.GOOGLE_CALENDAR_ID and settings.GOOGLE_SYNC_LIST_ID),
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

    sync_list_id = settings.GOOGLE_SYNC_LIST_ID
    if not sync_list_id:
        raise HTTPException(status_code=400, detail="Lista di sincronizzazione non configurata")

    # --- Push: MyActivity → Google ---
    result = await db.execute(
        select(Task).where(
            Task.list_id == sync_list_id,
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

    # --- Pull: Google → MyActivity ---
    pulled = 0
    try:
        events = fetch_calendar_events(days_back=7, days_forward=60)
        # Get existing google_event_ids
        existing_result = await db.execute(
            select(Task.google_event_id).where(
                Task.list_id == sync_list_id,
                Task.google_event_id.isnot(None),
            )
        )
        existing_event_ids = set(existing_result.scalars().all())

        # Use the sync list
        sync_list = await db.get(TaskList, sync_list_id)
        if not sync_list:
            return {"pushed": pushed, "pulled": 0, "detail": "Lista sync non trovata"}

        for event in events:
            if event.get("status") == "cancelled":
                continue
            event_id = event.get("id")
            if not event_id or event_id in existing_event_ids:
                continue

            # Skip events created by MyActivity
            ext_props = event.get("extendedProperties", {}).get("private", {})
            if ext_props.get("myactivity_task_id"):
                continue

            summary = event.get("summary", "Evento senza titolo")
            description = event.get("description", "")

            # Parse date
            start = event.get("start", {})
            due_date = None
            due_time = None
            if "date" in start:
                due_date = date.fromisoformat(start["date"])
            elif "dateTime" in start:
                from datetime import datetime as dt
                parsed = dt.fromisoformat(start["dateTime"])
                due_date = parsed.date()
                due_time = parsed.time()

            task = Task(
                title=summary,
                description=description if description else None,
                list_id=sync_list.id,
                created_by=sync_list.owner_id,
                due_date=due_date,
                due_time=due_time,
                google_event_id=event_id,
                priority=4,
            )
            db.add(task)
            pulled += 1

        await db.commit()
    except Exception as e:
        print(f"Error pulling events: {e}")

    return {"pushed": pushed, "pulled": pulled}
