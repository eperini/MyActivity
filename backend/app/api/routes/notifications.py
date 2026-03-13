from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.sharing import AppNotification

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
