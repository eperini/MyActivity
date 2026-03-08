"""Google Calendar sync service using a service account."""
import os
from datetime import datetime, date, timedelta, timezone

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.core.config import settings

SCOPES = ["https://www.googleapis.com/auth/calendar"]

_service = None


def _get_service():
    global _service
    if _service is None:
        creds_file = settings.GOOGLE_CREDENTIALS_FILE
        if not os.path.exists(creds_file):
            raise RuntimeError(f"Google credentials file not found: {creds_file}")
        creds = Credentials.from_service_account_file(creds_file, scopes=SCOPES)
        _service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    return _service


def _task_to_event(task) -> dict:
    """Convert a Task model to a Google Calendar event dict."""
    event = {
        "summary": task.title,
        "description": task.description or "",
        "extendedProperties": {
            "private": {"myactivity_task_id": str(task.id)}
        },
    }

    if task.due_date:
        if task.due_time:
            dt_start = datetime.combine(task.due_date, task.due_time, tzinfo=timezone.utc)
            dt_end = dt_start + timedelta(hours=1)
            event["start"] = {"dateTime": dt_start.isoformat(), "timeZone": "Europe/Rome"}
            event["end"] = {"dateTime": dt_end.isoformat(), "timeZone": "Europe/Rome"}
        else:
            event["start"] = {"date": task.due_date.isoformat()}
            event["end"] = {"date": task.due_date.isoformat()}
    else:
        # No date = today all-day
        today = date.today().isoformat()
        event["start"] = {"date": today}
        event["end"] = {"date": today}

    # Color based on priority (1=red, 2=orange, 3=yellow, 4=default)
    color_map = {1: "11", 2: "6", 3: "5"}  # Google Calendar color IDs
    if task.priority in color_map:
        event["colorId"] = color_map[task.priority]

    return event


def push_task_to_calendar(task, calendar_id: str = None) -> str | None:
    """Create or update a Google Calendar event for a task. Returns event ID."""
    cal_id = calendar_id or settings.GOOGLE_CALENDAR_ID
    if not cal_id:
        return None

    service = _get_service()
    event_data = _task_to_event(task)

    # Check if event already exists
    if task.google_event_id:
        try:
            service.events().update(
                calendarId=cal_id,
                eventId=task.google_event_id,
                body=event_data,
            ).execute()
            return task.google_event_id
        except HttpError as e:
            if e.resp.status == 404:
                pass  # Event deleted, create new one
            else:
                raise

    # Create new event
    created = service.events().insert(calendarId=cal_id, body=event_data).execute()
    return created.get("id")


def delete_task_from_calendar(event_id: str, calendar_id: str = None):
    """Delete a Google Calendar event."""
    cal_id = calendar_id or settings.GOOGLE_CALENDAR_ID
    if not cal_id or not event_id:
        return
    service = _get_service()
    try:
        service.events().delete(calendarId=cal_id, eventId=event_id).execute()
    except HttpError as e:
        if e.resp.status != 404:
            raise


def fetch_calendar_events(calendar_id: str = None, days_back: int = 7, days_forward: int = 30) -> list[dict]:
    """Fetch events from Google Calendar within a time window."""
    cal_id = calendar_id or settings.GOOGLE_CALENDAR_ID
    if not cal_id:
        return []

    service = _get_service()
    time_min = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
    time_max = (datetime.now(timezone.utc) + timedelta(days=days_forward)).isoformat()

    events = []
    page_token = None
    while True:
        result = service.events().list(
            calendarId=cal_id,
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy="startTime",
            maxResults=250,
            pageToken=page_token,
        ).execute()
        events.extend(result.get("items", []))
        page_token = result.get("nextPageToken")
        if not page_token:
            break

    return events


def list_calendars() -> list[dict]:
    """List calendars accessible by the service account."""
    service = _get_service()
    result = service.calendarList().list().execute()
    return [
        {"id": cal["id"], "summary": cal.get("summary", ""), "primary": cal.get("primary", False)}
        for cal in result.get("items", [])
    ]
