from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.sharing import AppNotification
from app.models.notification import TaskReminder, NotificationChannel
from app.models.task import Task

router = APIRouter()


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    body: str | None
    is_read: bool
    project_id: int | None
    task_id: int | None
    epic_id: int | None
    created_at: str


class NotificationListResponse(BaseModel):
    total: int
    unread: int
    notifications: list[NotificationResponse]


@router.get("/notifications/", response_model=NotificationListResponse)
async def get_notifications(
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Total + unread counts
    total_result = await db.execute(
        select(func.count()).where(AppNotification.user_id == user.id)
    )
    total = total_result.scalar() or 0

    unread_result = await db.execute(
        select(func.count()).where(
            AppNotification.user_id == user.id,
            AppNotification.is_read == False,
        )
    )
    unread = unread_result.scalar() or 0

    # Paginated notifications
    result = await db.execute(
        select(AppNotification)
        .where(AppNotification.user_id == user.id)
        .order_by(AppNotification.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    notifs = result.scalars().all()

    return NotificationListResponse(
        total=total,
        unread=unread,
        notifications=[
            NotificationResponse(
                id=n.id, type=n.type, title=n.title, body=n.body,
                is_read=n.is_read, project_id=n.project_id,
                task_id=n.task_id, epic_id=n.epic_id,
                created_at=n.created_at.isoformat(),
            )
            for n in notifs
        ],
    )


@router.get("/notifications/unread-count")
async def get_unread_count(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(func.count()).where(
            AppNotification.user_id == user.id,
            AppNotification.is_read == False,
        )
    )
    return {"unread": result.scalar() or 0}


@router.patch("/notifications/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notif = await db.get(AppNotification, notification_id)
    if not notif or notif.user_id != user.id:
        raise HTTPException(404, "Notifica non trovata")
    notif.is_read = True
    notif.read_at = datetime.now(timezone.utc)
    await db.commit()
    return {"detail": "Segnata come letta"}


@router.patch("/notifications/read-all")
async def mark_all_as_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(AppNotification)
        .where(
            AppNotification.user_id == user.id,
            AppNotification.is_read == False,
        )
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"detail": "Tutte segnate come lette"}


@router.delete("/notifications/{notification_id}")
async def delete_notification(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notif = await db.get(AppNotification, notification_id)
    if not notif or notif.user_id != user.id:
        raise HTTPException(404, "Notifica non trovata")
    await db.delete(notif)
    await db.commit()
    return {"detail": "Notifica eliminata"}


# ─── Task Reminders CRUD ───


class ReminderRequest(BaseModel):
    offset_minutes: int  # negative = before due date (e.g. -15, -60, -1440)
    channel: Optional[str] = "both"  # telegram, push, both


class ReminderResponse(BaseModel):
    id: int
    task_id: int
    offset_minutes: int
    channel: str
    sent_at: str | None
    created_at: str


@router.get("/tasks/{task_id}/reminders", response_model=list[ReminderResponse])
async def get_task_reminders(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify task belongs to user
    task = await db.get(Task, task_id)
    if not task or task.created_by != user.id:
        raise HTTPException(404, "Task non trovato")

    result = await db.execute(
        select(TaskReminder)
        .where(TaskReminder.task_id == task_id, TaskReminder.user_id == user.id)
        .order_by(TaskReminder.offset_minutes)
    )
    reminders = result.scalars().all()
    return [
        ReminderResponse(
            id=r.id,
            task_id=r.task_id,
            offset_minutes=r.offset_minutes,
            channel=r.channel.value if r.channel else "both",
            sent_at=r.sent_at.isoformat() if r.sent_at else None,
            created_at=r.created_at.isoformat(),
        )
        for r in reminders
    ]


@router.post("/tasks/{task_id}/reminders", response_model=ReminderResponse, status_code=201)
async def create_task_reminder(
    task_id: int,
    data: ReminderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task or task.created_by != user.id:
        raise HTTPException(404, "Task non trovato")
    if not task.due_date:
        raise HTTPException(400, "Il task non ha una data di scadenza")

    # Map channel string to enum
    channel_map = {
        "telegram": NotificationChannel.TELEGRAM,
        "push": NotificationChannel.PUSH,
        "both": NotificationChannel.BOTH,
        "email": NotificationChannel.EMAIL,
    }
    channel = channel_map.get(data.channel or "both", NotificationChannel.BOTH)

    # Check duplicate (same offset for same task)
    existing = await db.execute(
        select(TaskReminder).where(
            TaskReminder.task_id == task_id,
            TaskReminder.user_id == user.id,
            TaskReminder.offset_minutes == data.offset_minutes,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Promemoria con lo stesso offset gia esistente")

    reminder = TaskReminder(
        task_id=task_id,
        user_id=user.id,
        offset_minutes=data.offset_minutes,
        channel=channel,
    )
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)

    return ReminderResponse(
        id=reminder.id,
        task_id=reminder.task_id,
        offset_minutes=reminder.offset_minutes,
        channel=reminder.channel.value,
        sent_at=None,
        created_at=reminder.created_at.isoformat(),
    )


@router.delete("/reminders/{reminder_id}")
async def delete_reminder(
    reminder_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    reminder = await db.get(TaskReminder, reminder_id)
    if not reminder or reminder.user_id != user.id:
        raise HTTPException(404, "Promemoria non trovato")
    await db.delete(reminder)
    await db.commit()
    return {"detail": "Promemoria eliminato"}
