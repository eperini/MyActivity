"""
Worker Celery per:
1. Generare le istanze dei task ricorrenti (ogni giorno alle 00:05)
2. Controllare e inviare notifiche (ogni minuto)
3. Inviare il report giornaliero (ogni 5 minuti, check orario utente)
4. Backup database su Google Drive (ogni giorno alle 03:00)

Usa SQLAlchemy sincrono (psycopg2) per evitare problemi di event loop con Celery.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# URL sincrono per Celery (postgresql:// invece di postgresql+asyncpg://)
SYNC_DB_URL = settings.DATABASE_URL.replace("+asyncpg", "")
_engine = create_engine(SYNC_DB_URL, echo=False, pool_size=5, max_overflow=5)
_SessionLocal = sessionmaker(_engine)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def generate_recurring_instances(self):
    """Genera le istanze dei task ricorrenti per i prossimi 7 giorni."""
    from app.models.recurrence import RecurrenceRule, TaskInstance
    from app.models.task import Task
    from app.services.recurrence_service import get_occurrences

    try:
        with _SessionLocal() as db:
            # Batch load rules with their tasks to avoid N+1
            rules = db.execute(select(RecurrenceRule)).scalars().all()
            task_ids = [r.task_id for r in rules]
            tasks_result = db.execute(select(Task).where(Task.id.in_(task_ids))) if task_ids else None
            tasks_map = {t.id: t for t in (tasks_result.scalars().all() if tasks_result else [])}

            today = date.today()
            horizon = today + timedelta(days=7)
            created_count = 0

            for rule in rules:
                task = tasks_map.get(rule.task_id)
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

                # Batch check existing instances for this task
                existing_dates = set()
                if occurrences:
                    due_dts = [datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc) for d in occurrences if d <= horizon]
                    if due_dts:
                        existing_result = db.execute(
                            select(TaskInstance.due_date).where(
                                TaskInstance.task_id == rule.task_id,
                                TaskInstance.due_date.in_(due_dts),
                            )
                        )
                        existing_dates = {r[0] for r in existing_result.all()}

                for occ_date in occurrences:
                    if occ_date > horizon:
                        break

                    due_dt = datetime.combine(occ_date, datetime.min.time(), tzinfo=timezone.utc)

                    if due_dt in existing_dates:
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
    except Exception as exc:
        logger.exception("Error generating recurring instances")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=120)
def backup_database_to_drive(self):
    """Esegue pg_dump e carica il backup su Google Drive."""
    import subprocess
    import tempfile
    import gzip
    import os

    if not settings.GOOGLE_DRIVE_FOLDER_ID:
        return "GOOGLE_DRIVE_FOLDER_ID non configurato, backup saltato"

    # Build pg connection string from DATABASE_URL
    # Format: postgresql+asyncpg://user:pass@host:port/dbname
    db_url = SYNC_DB_URL  # already sync format
    from urllib.parse import urlparse
    parsed = urlparse(db_url)

    env = os.environ.copy()
    env["PGPASSWORD"] = parsed.password or ""

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"myactivity_{timestamp}.sql.gz"

    with tempfile.TemporaryDirectory() as tmpdir:
        sql_path = os.path.join(tmpdir, "dump.sql")
        gz_path = os.path.join(tmpdir, filename)

        # pg_dump
        result = subprocess.run(
            [
                "pg_dump",
                "-h", parsed.hostname or "db",
                "-p", str(parsed.port or 5432),
                "-U", parsed.username or "myactivity",
                "-d", parsed.path.lstrip("/") if parsed.path else "myactivity",
                "--no-owner",
                "--no-acl",
                "-f", sql_path,
            ],
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            logger.error("pg_dump failed: %s", result.stderr[:500])
            return "pg_dump fallito"

        # Compress
        with open(sql_path, "rb") as f_in:
            with gzip.open(gz_path, "wb") as f_out:
                f_out.writelines(f_in)

        file_size = os.path.getsize(gz_path)

        # Upload to Google Drive
        from app.services.google_drive import upload_backup, rotate_backups
        file_id = upload_backup(gz_path)

        # Rotate old backups
        deleted = rotate_backups()

        return f"Backup {filename} ({file_size} bytes) caricato su Drive (id={file_id}), eliminati {deleted} vecchi backup"


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def check_and_send_notifications(self):
    """Controlla e invia le notifiche in scadenza."""
    from app.models.notification import Notification
    from app.models.task import Task
    from app.models.user import User
    from app.services.telegram_service import send_message_sync

    now = datetime.now(timezone.utc)

    try:
        with _SessionLocal() as db:
            # Batch load notifications with tasks and users
            notifications = db.execute(
                select(Notification)
                .where(Notification.sent_at.is_(None))
                .where(Notification.task_id.isnot(None))
            ).scalars().all()

            if not notifications:
                return "Nessuna notifica da inviare"

            # Batch load tasks and users
            task_ids = {n.task_id for n in notifications if n.task_id}
            user_ids = {n.user_id for n in notifications}
            tasks_map = {}
            if task_ids:
                result = db.execute(select(Task).where(Task.id.in_(task_ids)))
                tasks_map = {t.id: t for t in result.scalars().all()}
            users_map = {}
            if user_ids:
                result = db.execute(select(User).where(User.id.in_(user_ids)))
                users_map = {u.id: u for u in result.scalars().all()}

            sent_count = 0
            for notif in notifications:
                task = tasks_map.get(notif.task_id)
                if not task or not task.due_date:
                    continue

                due_dt = datetime.combine(
                    task.due_date,
                    task.due_time or datetime.min.time(),
                    tzinfo=timezone.utc,
                )
                send_at = due_dt + timedelta(minutes=notif.offset_minutes)

                if now >= send_at:
                    user = users_map.get(notif.user_id)
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
    except Exception as exc:
        logger.exception("Error checking notifications")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def send_daily_reports(self):
    """Controlla quali utenti devono ricevere il report giornaliero e lo invia."""
    import json
    from zoneinfo import ZoneInfo

    from sqlalchemy import or_
    from app.models.user import User
    from app.models.task import Task, TaskStatus
    from app.models.task_list import ListMember

    rome_tz = ZoneInfo("Europe/Rome")
    now_rome = datetime.now(rome_tz)
    now_utc = datetime.now(timezone.utc)
    today = now_rome.date()
    tomorrow = today + timedelta(days=1)

    with _SessionLocal() as db:
        # Find users with daily report enabled (email or push)
        users = db.execute(
            select(User).where(
                or_(User.daily_report_email == True, User.daily_report_push == True)
            )
        ).scalars().all()

        sent_count = 0
        for user in users:
            if not user.daily_report_time:
                continue

            # Check if it's time to send (within 5-minute window)
            report_dt = datetime.combine(today, user.daily_report_time, tzinfo=rome_tz)
            diff_minutes = (now_rome - report_dt).total_seconds() / 60
            if diff_minutes < 0 or diff_minutes >= 5:
                continue

            # Check if already sent today
            if user.daily_report_last_sent:
                last_sent_rome = user.daily_report_last_sent.astimezone(rome_tz)
                if last_sent_rome.date() == today:
                    continue

            # Get user's list IDs (owned + member)
            list_ids = set()
            from app.models.task_list import TaskList
            owned = db.execute(
                select(TaskList.id).where(TaskList.owner_id == user.id)
            ).scalars().all()
            list_ids.update(owned)
            member_of = db.execute(
                select(ListMember.list_id).where(ListMember.user_id == user.id)
            ).scalars().all()
            list_ids.update(member_of)

            if not list_ids:
                continue

            # Query tasks
            base_q = select(Task).where(
                Task.list_id.in_(list_ids),
                Task.status != TaskStatus.DONE,
            )

            overdue_tasks = db.execute(
                base_q.where(Task.due_date < today)
            ).scalars().all()

            today_tasks = db.execute(
                base_q.where(Task.due_date == today)
            ).scalars().all()

            tomorrow_tasks = db.execute(
                base_q.where(Task.due_date == tomorrow)
            ).scalars().all()

            if not overdue_tasks and not today_tasks and not tomorrow_tasks:
                user.daily_report_last_sent = now_utc
                continue

            # Build report
            priority_emoji = {1: "🔴", 2: "🟠", 3: "🟡", 4: "⚪"}

            def task_line(t):
                emoji = priority_emoji.get(t.priority, "⚪")
                time_str = f" alle {t.due_time.strftime('%H:%M')}" if t.due_time else ""
                return f"{emoji} {t.title}{time_str}"

            # Send email
            if user.daily_report_email:
                html = _build_report_html(
                    user.display_name, today, overdue_tasks, today_tasks, tomorrow_tasks, priority_emoji
                )
                from app.services.email_service import send_email
                send_email(user.email, f"📋 Report giornaliero - {today.strftime('%d/%m/%Y')}", html)

            # Send push notification
            if user.daily_report_push:
                lines = []
                if overdue_tasks:
                    lines.append(f"⚠️ {len(overdue_tasks)} in ritardo")
                if today_tasks:
                    lines.append(f"📅 {len(today_tasks)} oggi")
                if tomorrow_tasks:
                    lines.append(f"📆 {len(tomorrow_tasks)} domani")
                body = " · ".join(lines)

                from app.models.push_subscription import PushSubscription
                subs = db.execute(
                    select(PushSubscription).where(PushSubscription.user_id == user.id)
                ).scalars().all()

                if subs:
                    _send_push_to_subs(subs, "📋 Report giornaliero", body, db)

            # Send Telegram
            if user.telegram_chat_id:
                text = f"📋 <b>Report giornaliero</b> - {today.strftime('%d/%m/%Y')}\n"
                if overdue_tasks:
                    text += f"\n⚠️ <b>In ritardo ({len(overdue_tasks)})</b>\n"
                    text += "\n".join(task_line(t) for t in overdue_tasks[:10])
                    text += "\n"
                if today_tasks:
                    text += f"\n📅 <b>Oggi ({len(today_tasks)})</b>\n"
                    text += "\n".join(task_line(t) for t in today_tasks[:10])
                    text += "\n"
                if tomorrow_tasks:
                    text += f"\n📆 <b>Domani ({len(tomorrow_tasks)})</b>\n"
                    text += "\n".join(task_line(t) for t in tomorrow_tasks[:10])

                from app.services.telegram_service import send_message_sync
                if user.daily_report_email or user.daily_report_push:
                    send_message_sync(user.telegram_chat_id, text)

            user.daily_report_last_sent = now_utc
            sent_count += 1

        db.commit()
        return f"Report giornaliero inviato a {sent_count} utenti"


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def evaluate_automations(self, task_id: int, event: str, payload: dict | None = None):
    """
    Evaluate automation rules for a task's project.
    Called after task events (status_changed, task_created, assigned_to_changed, etc.).
    """
    from app.models.task import Task, TaskStatus
    from app.models.automation import AutomationRule, TriggerType, ActionType

    if payload is None:
        payload = {}

    try:
        with _SessionLocal() as db:
            task = db.get(Task, task_id)
            if not task or not task.project_id:
                return "Task non trovato o senza progetto"

            # Load active rules for this project matching the trigger
            rules = db.execute(
                select(AutomationRule).where(
                    AutomationRule.project_id == task.project_id,
                    AutomationRule.is_active == True,  # noqa: E712
                    AutomationRule.trigger_type == event,
                )
            ).scalars().all()

            if not rules:
                return f"Nessuna regola attiva per evento {event}"

            executed = 0
            for rule in rules:
                trigger_cfg = rule.trigger_config or {}
                action_cfg = rule.action_config or {}

                # Check trigger conditions
                if not _match_trigger(event, trigger_cfg, payload):
                    continue

                # Execute action
                _execute_action(rule.action_type, action_cfg, task, db)

                rule.last_triggered = datetime.now(timezone.utc)
                executed += 1

            db.commit()
            return f"Eseguite {executed}/{len(rules)} regole per task {task_id}"
    except Exception as exc:
        logger.exception("Error evaluating automations for task %s", task_id)
        raise self.retry(exc=exc)


def _match_trigger(event: str, trigger_cfg: dict, payload: dict) -> bool:
    """Check if the trigger config matches the event payload."""
    # status_changed: optionally filter by from_status / to_status
    if event == "status_changed":
        if "from_status" in trigger_cfg and payload.get("old_status") != trigger_cfg["from_status"]:
            return False
        if "to_status" in trigger_cfg and payload.get("new_status") != trigger_cfg["to_status"]:
            return False
    # assigned_to_changed: optionally filter by to_user
    elif event == "assigned_to_changed":
        if "to_user" in trigger_cfg and payload.get("new_assigned_to") != trigger_cfg["to_user"]:
            return False
    # task_created, all_subtasks_done, due_date_passed: no extra filtering needed
    return True


def _execute_action(action_type: str, action_cfg: dict, task, db):
    """Execute an automation action on the task."""
    from app.models.task import Task, TaskStatus

    if action_type == "change_status":
        new_status = action_cfg.get("status")
        if new_status:
            try:
                task.status = TaskStatus(new_status)
                if task.status == TaskStatus.DONE:
                    task.completed_at = datetime.now(timezone.utc)
            except ValueError:
                logger.warning("Invalid status in automation action: %s", new_status)

    elif action_type == "assign_to":
        user_id = action_cfg.get("user_id")
        if user_id is not None:
            task.assigned_to = user_id

    elif action_type == "set_field":
        field_name = action_cfg.get("field")
        field_value = action_cfg.get("value")
        if field_name and field_name in ("priority", "description"):
            setattr(task, field_name, field_value)
        elif field_name:
            # Custom field
            cf = dict(task.custom_fields) if task.custom_fields else {}
            cf[field_name] = field_value
            task.custom_fields = cf

    elif action_type == "create_task":
        title = action_cfg.get("title")
        if title:
            new_task = Task(
                title=title,
                list_id=task.list_id,
                created_by=task.created_by,
                project_id=task.project_id,
                priority=action_cfg.get("priority", 4),
                parent_id=action_cfg.get("as_subtask") and task.id or None,
            )
            db.add(new_task)

    elif action_type == "send_notification":
        message = action_cfg.get("message", f"Automazione attivata per: {task.title}")
        user_id = action_cfg.get("user_id") or task.assigned_to or task.created_by
        if user_id:
            from app.models.user import User
            user = db.get(User, user_id)
            if user and user.telegram_chat_id:
                try:
                    from app.services.telegram_service import send_message_sync
                    send_message_sync(user.telegram_chat_id, f"🤖 <b>Automazione</b>\n\n{message}")
                except Exception as e:
                    logger.warning("Failed to send automation notification: %s", e)


def _build_report_html(display_name, today, overdue, today_tasks, tomorrow_tasks, emojis):
    """Build HTML email for the daily report."""
    import html
    priority_colors = {1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#9ca3af"}

    def task_row(t):
        color = priority_colors.get(t.priority, "#9ca3af")
        safe_title = html.escape(t.title)
        time_str = f" <span style='color:#888'>alle {t.due_time.strftime('%H:%M')}</span>" if t.due_time else ""
        return f"<li style='padding:4px 0'><span style='color:{color};font-weight:bold'>●</span> {safe_title}{time_str}</li>"

    sections = ""
    if overdue:
        sections += f"<h3 style='color:#ef4444;margin-top:16px'>⚠️ In ritardo ({len(overdue)})</h3><ul style='list-style:none;padding:0'>{''.join(task_row(t) for t in overdue)}</ul>"
    if today_tasks:
        sections += f"<h3 style='color:#3b82f6;margin-top:16px'>📅 Oggi ({len(today_tasks)})</h3><ul style='list-style:none;padding:0'>{''.join(task_row(t) for t in today_tasks)}</ul>"
    if tomorrow_tasks:
        sections += f"<h3 style='color:#8b5cf6;margin-top:16px'>📆 Domani ({len(tomorrow_tasks)})</h3><ul style='list-style:none;padding:0'>{''.join(task_row(t) for t in tomorrow_tasks)}</ul>"

    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#1a1a2e;color:#e0e0e0;padding:24px;border-radius:12px">
      <h2 style="color:#fff;margin-bottom:4px">📋 Report giornaliero</h2>
      <p style="color:#888;margin-top:0">{display_name} · {today.strftime('%A %d %B %Y')}</p>
      {sections}
      <hr style="border-color:#333;margin-top:24px">
      <p style="color:#666;font-size:12px;text-align:center">MyActivity</p>
    </div>
    """


def _send_push_to_subs(subs, title, body, db):
    """Send web push notifications to subscriptions."""
    import json
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return

    payload = json.dumps({
        "title": title,
        "body": body,
        "icon": "/icons/icon-192.png",
    })

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_MAILTO},
            )
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                db.delete(sub)
            else:
                logger.warning("Push failed for sub %s: %s", sub.id, e)
        except Exception as e:
            logger.warning("Push error for sub %s: %s", sub.id, e)
