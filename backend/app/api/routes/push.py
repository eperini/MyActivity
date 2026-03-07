import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.push_subscription import PushSubscription

router = APIRouter()


class SubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.get("/vapid-key")
async def get_vapid_key():
    """Return the public VAPID key for the frontend."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=404, detail="Push notifications not configured")
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe")
async def subscribe(
    data: SubscribeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Upsert: delete old with same endpoint, then insert
    await db.execute(
        delete(PushSubscription).where(PushSubscription.endpoint == data.endpoint)
    )
    sub = PushSubscription(
        user_id=user.id,
        endpoint=data.endpoint,
        p256dh=data.p256dh,
        auth=data.auth,
    )
    db.add(sub)
    await db.commit()
    return {"detail": "Iscrizione push salvata"}


@router.delete("/subscribe")
async def unsubscribe(
    data: SubscribeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == data.endpoint,
            PushSubscription.user_id == user.id,
        )
    )
    await db.commit()
    return {"detail": "Iscrizione push rimossa"}


@router.post("/test")
async def send_test_push(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a test push notification to the current user."""
    if not settings.VAPID_PRIVATE_KEY:
        raise HTTPException(status_code=400, detail="Push notifications not configured")

    from pywebpush import webpush, WebPushException

    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user.id)
    )
    subs = result.scalars().all()
    if not subs:
        raise HTTPException(status_code=404, detail="Nessuna iscrizione push trovata")

    payload = json.dumps({
        "title": "MyActivity",
        "body": "Le notifiche push funzionano!",
        "icon": "/icons/icon-192.png",
    })

    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{settings.VAPID_MAILTO}"},
            )
            sent += 1
        except WebPushException:
            # Subscription expired, remove it
            await db.delete(sub)

    await db.commit()
    return {"detail": f"Notifica inviata a {sent} dispositivo/i"}
