"""
Centralized notification service.
Creates in-app notifications and sends Telegram messages.
"""

import logging

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.sharing import AppNotification, NotificationType
from app.models.project import ProjectMember
from app.models.user import User
from app.services.telegram_service import send_message_sync

logger = logging.getLogger(__name__)


class NotificationService:

    def __init__(self, db: Session):
        self.db = db

    def notify(
        self,
        user_id: int,
        type: NotificationType,
        title: str,
        body: str = "",
        project_id: int | None = None,
        task_id: int | None = None,
        epic_id: int | None = None,
        send_telegram: bool = True,
    ) -> AppNotification:
        notif = AppNotification(
            user_id=user_id,
            type=type.value,
            title=title,
            body=body,
            project_id=project_id,
            task_id=task_id,
            epic_id=epic_id,
        )
        self.db.add(notif)
        self.db.flush()

        if send_telegram:
            user = self.db.get(User, user_id)
            if user and user.telegram_chat_id:
                telegram_text = self._format_telegram(type, title, body)
                try:
                    send_message_sync(user.telegram_chat_id, telegram_text)
                    notif.sent_telegram = True
                except Exception:
                    logger.warning("Telegram send failed for user %s", user_id)

        return notif

    def notify_members(
        self,
        project_id: int,
        type: NotificationType,
        title: str,
        body: str = "",
        exclude_user_id: int | None = None,
        task_id: int | None = None,
        epic_id: int | None = None,
    ) -> list[AppNotification]:
        members = self.db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
            )
        ).scalars().all()

        notifications = []
        for member in members:
            if member.user_id == exclude_user_id:
                continue
            notif = self.notify(
                user_id=member.user_id,
                type=type,
                title=title,
                body=body,
                project_id=project_id,
                task_id=task_id,
                epic_id=epic_id,
            )
            notifications.append(notif)

        return notifications

    def _format_telegram(
        self,
        type: NotificationType,
        title: str,
        body: str,
    ) -> str:
        emoji_map = {
            NotificationType.TASK_ASSIGNED: "👤",
            NotificationType.TASK_STATUS_CHANGED: "🔄",
            NotificationType.TASK_COMMENTED: "💬",
            NotificationType.TASK_DUE_SOON: "⏰",
            NotificationType.PROJECT_INVITATION: "📩",
            NotificationType.SPRINT_STARTED: "🚀",
            NotificationType.SPRINT_COMPLETED: "✅",
            NotificationType.MENTION: "🔔",
            NotificationType.AUTOMATION_TRIGGERED: "⚙️",
            NotificationType.TEMPO_SYNC_ERROR: "⚠️",
            NotificationType.REPORT_READY: "📊",
        }
        emoji = emoji_map.get(type, "📌")
        text = f"{emoji} <b>{title}</b>"
        if body:
            text += f"\n{body}"
        return text
