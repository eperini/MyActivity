"""
Worker Celery per:
1. Generare le istanze dei task ricorrenti (ogni giorno alle 00:05)
2. Controllare e inviare notifiche (ogni minuto)

Usa SQLAlchemy sincrono (psycopg2) per evitare problemi di event loop con Celery.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.workers.celery_app import celery_app

# URL sincrono per Celery (postgresql:// invece di postgresql+asyncpg://)
SYNC_DB_URL = settings.DATABASE_URL.replace("+asyncpg", "")
_engine = create_engine(SYNC_DB_URL, echo=False)
_SessionLocal = sessionmaker(_engine)


@celery_app.task
def generate_recurring_instances():
    """Genera le istanze dei task ricorrenti per i prossimi 7 giorni."""
    from app.models.recurrence import RecurrenceRule, TaskInstance
    from app.models.task import Task
    from app.services.recurrence_service import get_occurrences

    with _SessionLocal() as db:
        rules = db.execute(select(RecurrenceRule)).scalars().all()

        today = date.today()
        horizon = today + timedelta(days=7)
        created_count = 0

        for rule in rules:
            task = db.get(Task, rule.task_id)
            if not task:
                continue

            start = task.due_date or today
            occurrences = get_occurrences(
                rrule_string=rule.rrule,
                dtstart=start,
                after=today,
                count=14,
                workday_adjust=rule.workday_adjust.value,
                workday_target=rule.workday_target,
            )

            for occ_date in occurrences:
                if occ_date > horizon:
                    break

                due_dt = datetime.combine(occ_date, datetime.min.time(), tzinfo=timezone.utc)

                existing = db.execute(
                    select(TaskInstance).where(
                        TaskInstance.task_id == rule.task_id,
                        TaskInstance.due_date == due_dt,
                    )
                ).scalar_one_or_none()

                if existing:
                    continue

                instance = TaskInstance(
                    task_id=rule.task_id,
                    due_date=due_dt,
                    status="todo",
                )
                db.add(instance)
                created_count += 1

            # Aggiorna next_occurrence
            future = [d for d in occurrences if d >= today]
            if future:
                rule.next_occurrence = datetime.combine(
                    future[0], datetime.min.time(), tzinfo=timezone.utc
                )

        db.commit()
        return f"Create {created_count} nuove istanze"


@celery_app.task
def check_and_send_notifications():
    """Controlla e invia le notifiche in scadenza."""
    from app.models.notification import Notification
    from app.models.task import Task
    from app.models.user import User
    from app.services.telegram_service import send_message_sync

    now = datetime.now(timezone.utc)

    with _SessionLocal() as db:
        notifications = db.execute(
            select(Notification)
            .where(Notification.sent_at.is_(None))
            .where(Notification.task_id.isnot(None))
        ).scalars().all()

        sent_count = 0
        for notif in notifications:
            task = db.get(Task, notif.task_id)
            if not task or not task.due_date:
                continue

            due_dt = datetime.combine(
                task.due_date,
                task.due_time or datetime.min.time(),
                tzinfo=timezone.utc,
            )
            send_at = due_dt + timedelta(minutes=notif.offset_minutes)

            if now >= send_at:
                user = db.get(User, notif.user_id)
                if user and user.telegram_chat_id:
                    priority_emoji = {1: "🔴", 2: "🟠", 3: "🟡", 4: "⚪"}
                    emoji = priority_emoji.get(task.priority, "⚪")
                    text = f"{emoji} <b>Promemoria</b>\n\n{task.title}"
                    if task.description:
                        text += f"\n<i>{task.description}</i>"
                    if send_message_sync(user.telegram_chat_id, text):
                        notif.sent_at = now
                        sent_count += 1

        db.commit()
        return f"Inviate {sent_count} notifiche"
