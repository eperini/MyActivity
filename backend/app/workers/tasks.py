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

from sqlalchemy import create_engine, false as sa_false, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# URL sincrono per Celery (postgresql:// invece di postgresql+asyncpg://)
SYNC_DB_URL = settings.DATABASE_URL.replace("+asyncpg", "")
_engine = create_engine(SYNC_DB_URL, echo=False, pool_size=10, max_overflow=10)
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
    filename = f"zeno_{timestamp}.sql.gz"

    with tempfile.TemporaryDirectory() as tmpdir:
        sql_path = os.path.join(tmpdir, "dump.sql")
        gz_path = os.path.join(tmpdir, filename)

        # pg_dump
        result = subprocess.run(
            [
                "pg_dump",
                "-h", parsed.hostname or "db",
                "-p", str(parsed.port or 5432),
                "-U", parsed.username or "zeno",
                "-d", parsed.path.lstrip("/") if parsed.path else "zeno",
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
    """Controlla e invia le notifiche in scadenza via Telegram e/o Web Push."""
    from app.models.notification import TaskReminder, NotificationChannel
    from app.models.task import Task
    from app.models.user import User
    from app.models.push_subscription import PushSubscription
    from app.services.telegram_service import send_message_sync

    now = datetime.now(timezone.utc)

    try:
        with _SessionLocal() as db:
            # Batch load notifications with tasks and users
            notifications = db.execute(
                select(TaskReminder)
                .where(TaskReminder.sent_at.is_(None))
                .where(TaskReminder.task_id.isnot(None))
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

            # Batch load push subscriptions for all relevant users
            push_subs_map = {}
            if user_ids:
                result = db.execute(
                    select(PushSubscription).where(PushSubscription.user_id.in_(user_ids))
                )
                for sub in result.scalars().all():
                    push_subs_map.setdefault(sub.user_id, []).append(sub)

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
                    if not user:
                        continue

                    priority_emoji = {1: "🔴", 2: "🟠", 3: "🟡", 4: "⚪"}
                    emoji = priority_emoji.get(task.priority, "⚪")
                    title = f"{emoji} Promemoria"
                    body = task.title
                    if task.description:
                        body += f"\n{task.description}"

                    channel = notif.channel
                    sent = False

                    # Send via Telegram
                    if channel in (NotificationChannel.TELEGRAM, NotificationChannel.BOTH, NotificationChannel.EMAIL):
                        if user.telegram_chat_id:
                            text = f"{emoji} <b>Promemoria</b>\n\n{task.title}"
                            if task.description:
                                text += f"\n<i>{task.description}</i>"
                            if send_message_sync(user.telegram_chat_id, text):
                                sent = True

                    # Send via Web Push
                    if channel in (NotificationChannel.PUSH, NotificationChannel.BOTH):
                        user_subs = push_subs_map.get(user.id, [])
                        if user_subs:
                            _send_push_to_subs(user_subs, title, body, db)
                            sent = True

                    if sent:
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
    from app.models.project import Project, ProjectMember

    rome_tz = ZoneInfo("Europe/Rome")
    now_rome = datetime.now(rome_tz)
    now_utc = datetime.now(timezone.utc)
    today = now_rome.date()
    tomorrow = today + timedelta(days=1)

    with _SessionLocal() as db:
        # Find users with daily report enabled (email or push)
        users = db.execute(
            select(User).where(
                or_(
                    User.daily_report_email == True,
                    User.daily_report_push == True,
                    User.telegram_chat_id.isnot(None),
                )
            )
        ).scalars().all()

        sent_count = 0
        for user in users:
            if not user.daily_report_time:
                continue

            # Check if it's time to send (within 10-minute window to handle schedule drift)
            report_dt = datetime.combine(today, user.daily_report_time, tzinfo=rome_tz)
            diff_minutes = (now_rome - report_dt).total_seconds() / 60
            if diff_minutes < 0 or diff_minutes >= 10:
                continue

            # Check if already sent today
            if user.daily_report_last_sent:
                last_sent_rome = user.daily_report_last_sent.astimezone(rome_tz)
                if last_sent_rome.date() == today:
                    continue

            # Get user's project IDs (owned + member)
            project_ids = set()
            owned = db.execute(
                select(Project.id).where(Project.owner_id == user.id)
            ).scalars().all()
            project_ids.update(owned)
            member_of = db.execute(
                select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
            ).scalars().all()
            project_ids.update(member_of)

            from sqlalchemy import or_

            # Query tasks (from projects + unassigned tasks owned by user)
            base_q = select(Task).where(
                or_(
                    Task.project_id.in_(project_ids) if project_ids else sa_false(),
                    Task.project_id.is_(None) & (Task.created_by == user.id),
                ),
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

            # Gather extra stats: yesterday's time logs and habit streaks
            from app.models.time_log import TimeLog
            from app.models.habit import Habit, HabitLog
            yesterday = today - timedelta(days=1)
            day_after_tomorrow = today + timedelta(days=2)

            # Time logged yesterday
            time_result = db.execute(
                select(func.coalesce(func.sum(TimeLog.minutes), 0)).where(
                    TimeLog.user_id == user.id,
                    func.date(TimeLog.logged_at) == yesterday,
                )
            )
            yesterday_minutes = time_result.scalar() or 0

            # Tasks due in next 3 days (beyond tomorrow)
            upcoming_tasks = db.execute(
                select(Task).where(
                    or_(
                        Task.project_id.in_(project_ids) if project_ids else sa_false(),
                        Task.project_id.is_(None) & (Task.created_by == user.id),
                    ),
                    Task.status != TaskStatus.DONE,
                    Task.due_date == day_after_tomorrow,
                )
            ).scalars().all()

            # Active habit streak count
            active_habits = db.execute(
                select(func.count(Habit.id)).where(
                    Habit.created_by == user.id,
                    Habit.is_archived == False,
                )
            ).scalar() or 0

            habits_done_yesterday = db.execute(
                select(func.count(HabitLog.id)).where(
                    HabitLog.log_date == yesterday,
                    HabitLog.habit_id.in_(
                        select(Habit.id).where(Habit.created_by == user.id)
                    ),
                )
            ).scalar() or 0

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
                if yesterday_minutes > 0:
                    lines.append(f"⏱️ {round(yesterday_minutes / 60, 1)}h ieri")
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
                    text += "\n"
                if upcoming_tasks:
                    text += f"\n🗓️ <b>Dopodomani ({len(upcoming_tasks)})</b>\n"
                    text += "\n".join(task_line(t) for t in upcoming_tasks[:5])
                    text += "\n"
                # Stats footer
                stats_parts = []
                if yesterday_minutes > 0:
                    stats_parts.append(f"⏱️ {round(yesterday_minutes / 60, 1)}h ieri")
                if active_habits > 0:
                    stats_parts.append(f"🔥 {habits_done_yesterday}/{active_habits} abitudini ieri")
                if stats_parts:
                    text += f"\n{'  ·  '.join(stats_parts)}"

                from app.services.telegram_service import send_message_sync
                send_message_sync(user.telegram_chat_id, text)

            user.daily_report_last_sent = now_utc
            sent_count += 1

        db.commit()
        return f"Report giornaliero inviato a {sent_count} utenti"


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def evaluate_automations(self, task_id: int, event: str, payload: dict | None = None, depth: int = 0):
    """
    Evaluate automation rules for a task's project.
    Called after task events (status_changed, task_created, assigned_to_changed, etc.).
    """
    from app.models.task import Task, TaskStatus
    from app.models.automation import AutomationRule, TriggerType, ActionType

    if depth >= 3:
        logger.warning("Max automation recursion depth reached for task %s (depth=%d)", task_id, depth)
        return "Max recursion depth reached"

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
                created_by=task.created_by,
                project_id=task.project_id,
                priority=action_cfg.get("priority", 4),
                parent_id=action_cfg.get("as_subtask") and task.id or None,
            )
            db.add(new_task)
            # NOTE: Do NOT trigger evaluate_automations on the newly created task.
            # This prevents infinite recursion (create_task action → task_created
            # trigger → create_task action → ...). Tasks created by automations
            # are intentionally excluded from further automation evaluation.

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
      <p style="color:#666;font-size:12px;text-align:center">Zeno</p>
    </div>
    """


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def send_weekly_time_report(self):
    """Invia report ore settimanale (venerdì alle 18:00)."""
    from app.models.user import User
    from app.models.time_log import TimeLog
    from app.models.task import Task
    from app.models.project import Project
    from app.models.push_subscription import PushSubscription

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    try:
        with _SessionLocal() as db:
            users = db.execute(select(User)).scalars().all()
            for u in users:
                rows = db.execute(
                    select(TimeLog, Task.title, Task.project_id)
                    .join(Task, TimeLog.task_id == Task.id)
                    .where(
                        TimeLog.user_id == u.id,
                        TimeLog.logged_at >= week_start,
                        TimeLog.logged_at <= week_end,
                    )
                ).all()
                if not rows:
                    continue

                total = sum(log.minutes for log, _, _ in rows)

                # Group by project
                by_proj: dict[int | None, int] = {}
                for log, _, pid in rows:
                    by_proj[pid] = by_proj.get(pid, 0) + log.minutes

                proj_names = {}
                proj_ids = [p for p in by_proj if p is not None]
                if proj_ids:
                    prows = db.execute(
                        select(Project.id, Project.name).where(Project.id.in_(proj_ids))
                    ).all()
                    proj_names = {r.id: r.name for r in prows}

                def fmt(m):
                    h, r = divmod(m, 60)
                    return f"{h}h {r}m" if h and r else f"{h}h" if h else f"{r}m"

                lines = [f"📊 Report ore settimana {week_start.strftime('%d/%m')} - {week_end.strftime('%d/%m')}"]
                lines.append(f"Totale: {fmt(total)}")
                lines.append("")
                for pid, mins in sorted(by_proj.items(), key=lambda x: x[1], reverse=True):
                    pname = proj_names.get(pid, "Senza progetto") if pid else "Senza progetto"
                    lines.append(f"  • {pname}: {fmt(mins)}")

                msg = "\n".join(lines)

                # Telegram
                if u.telegram_chat_id:
                    try:
                        from app.services.telegram_service import send_message_sync
                        send_message_sync(u.telegram_chat_id, msg)
                    except Exception as e:
                        logger.warning("Weekly report Telegram error for user %s: %s", u.id, e)

                # Push
                subs = db.execute(
                    select(PushSubscription).where(PushSubscription.user_id == u.id)
                ).scalars().all()
                if subs:
                    _send_push_to_subs(subs, "Report ore settimanale", f"Totale: {fmt(total)}", db)

                db.commit()

        logger.info("Weekly time report sent")
    except Exception as exc:
        logger.error("Weekly time report error: %s", exc)
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def sync_jira_projects(self):
    """Sync all enabled Jira project mappings."""
    from app.models.jira import JiraConfig

    if not settings.JIRA_BASE_URL:
        return

    try:
        with _SessionLocal() as db:
            configs = db.execute(
                select(JiraConfig).where(JiraConfig.sync_enabled == True)
            ).scalars().all()

            for config in configs:
                try:
                    config.last_sync_status = "running"
                    db.commit()
                    _sync_single_jira(db, config)
                    config.last_sync_status = "ok"
                    config.last_sync_at = datetime.now(timezone.utc)
                    config.last_sync_error = None
                except Exception as e:
                    logger.warning("Jira sync error for config %s: %s", config.id, e)
                    config.last_sync_status = "error"
                    config.last_sync_error = str(e)[:500]
                finally:
                    db.commit()

        logger.info("Jira sync completed for %d configs", len(configs))
    except Exception as exc:
        logger.error("Jira sync error: %s", exc)
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def sync_single_jira_config(self, config_id: int):
    """Sync a single Jira config (triggered manually)."""
    from app.models.jira import JiraConfig

    try:
        with _SessionLocal() as db:
            config = db.get(JiraConfig, config_id)
            if not config:
                return
            try:
                config.last_sync_status = "running"
                db.commit()
                _sync_single_jira(db, config)
                config.last_sync_status = "ok"
                config.last_sync_at = datetime.now(timezone.utc)
                config.last_sync_error = None
            except Exception as e:
                logger.warning("Jira sync error for config %s: %s", config.id, e)
                config.last_sync_status = "error"
                config.last_sync_error = str(e)[:500]
            finally:
                db.commit()
    except Exception as exc:
        logger.error("Jira single sync error: %s", exc)
        raise self.retry(exc=exc)


def _map_epic_status_from_jira(jira_status: str) -> str:
    mapping = {
        "to do": "todo", "open": "todo", "backlog": "todo",
        "in progress": "in_progress",
        "done": "done", "closed": "done",
    }
    return mapping.get(jira_status.lower(), "todo")


def _sync_single_jira(db, config):
    """Sync a single Jira project → Zeno (issues + epics)."""
    import time as time_module
    from app.models.task import Task, TaskStatus
    from app.models.project import Project
    from app.models.epic import Epic
    from app.models.jira import JiraUserMapping
    from app.services.jira_service import (
        JiraServiceSync, map_priority_from_jira, map_status_from_jira, extract_adf_text,
    )

    jira = JiraServiceSync()
    issues = jira.get_project_issues(
        project_key=config.jira_project_key,
        updated_after=config.last_sync_at,
    )
    logger.info("Jira sync for %s: fetched %d issues (updated_after=%s)",
                config.jira_project_key, len(issues), config.last_sync_at)
    for issue in issues:
        itype = issue["fields"].get("issuetype", {}).get("name", "?")
        logger.info("  Issue %s: type=%s, summary=%s", issue["key"], itype, issue["fields"].get("summary", "")[:60])

    project = db.get(Project, config.zeno_project_id)
    if not project:
        return

    # Load Jira → Zeno user mappings
    user_mappings_rows = db.execute(
        select(JiraUserMapping).where(JiraUserMapping.config_id == config.id)
    ).scalars().all()
    jira_to_zeno = {m.jira_account_id: m.zeno_user_id for m in user_mappings_rows if m.zeno_user_id}

    for issue in issues:
        # Skip Epics from task sync — they are handled separately below
        if issue["fields"].get("issuetype", {}).get("name") == "Epic":
            continue
        fields = issue["fields"]
        existing = db.execute(
            select(Task).where(Task.jira_issue_key == issue["key"])
        ).scalar_one_or_none()

        jira_status = map_status_from_jira(fields["status"]["name"])
        jira_priority = map_priority_from_jira(
            fields.get("priority", {}).get("name", "Medium")
        )
        due_str = fields.get("duedate")
        due_date_val = None
        if due_str:
            try:
                due_date_val = date.fromisoformat(due_str)
            except (ValueError, TypeError):
                pass

        # Resolve assigned_to via user mapping
        assignee = fields.get("assignee")
        jira_assignee_id = assignee.get("accountId") if assignee else None
        assigned_to = jira_to_zeno.get(jira_assignee_id, config.user_id) if jira_assignee_id else config.user_id

        mapped = {
            "title": fields["summary"],
            "description": extract_adf_text(fields.get("description")),
            "priority": jira_priority,
            "due_date": due_date_val,
            "jira_issue_key": issue["key"],
            "jira_issue_id": issue["id"],
            "jira_url": f"{settings.JIRA_BASE_URL}/browse/{issue['key']}",
            "jira_synced_at": datetime.now(timezone.utc),
        }

        if existing:
            # Conflict resolution: if local was modified after last sync, skip
            last_synced = existing.jira_synced_at or datetime.min.replace(tzinfo=timezone.utc)
            local_updated = existing.updated_at
            if local_updated.tzinfo is None:
                local_updated = local_updated.replace(tzinfo=timezone.utc)
            if local_updated <= last_synced:
                for k, v in mapped.items():
                    setattr(existing, k, v)
                existing.status = TaskStatus(jira_status)
                existing.assigned_to = assigned_to
        else:
            new_task = Task(
                **mapped,
                status=TaskStatus(jira_status),
                project_id=config.zeno_project_id,
                created_by=config.user_id,
                assigned_to=assigned_to,
            )
            db.add(new_task)
            try:
                db.flush()
            except Exception:
                # Race condition: another sync already created this task
                db.rollback()
                logger.debug("Skipping duplicate jira issue %s", issue["key"])
                continue

        # Rate limit: small delay between issues
        time_module.sleep(0.1)

    db.flush()

    # Sync Epics
    try:
        epics_data = jira.get_project_epics_sync(config.jira_project_key)
        for epic_data in epics_data:
            _sync_single_epic(db, config, epic_data, extract_adf_text)
            time_module.sleep(0.1)
        db.flush()
    except Exception as e:
        logger.warning("Epic sync error for %s: %s", config.jira_project_key, e)


def _sync_single_epic(db, config, epic_data: dict, extract_adf_text):
    """Upsert a Jira Epic into Zeno."""
    from app.models.epic import Epic

    fields = epic_data["fields"]
    jira_key = epic_data["key"]

    existing = db.execute(
        select(Epic).where(Epic.jira_issue_key == jira_key)
    ).scalar_one_or_none()

    due_str = fields.get("duedate")
    target_date_val = None
    if due_str:
        try:
            target_date_val = date.fromisoformat(due_str)
        except (ValueError, TypeError):
            pass

    mapped = {
        "name": fields["summary"],
        "description": extract_adf_text(fields.get("description")),
        "status": _map_epic_status_from_jira(fields["status"]["name"]),
        "target_date": target_date_val,
        "jira_issue_key": jira_key,
        "jira_issue_id": epic_data["id"],
        "jira_url": f"{settings.JIRA_BASE_URL}/browse/{jira_key}",
        "jira_synced_at": datetime.now(timezone.utc),
    }

    if existing:
        last_synced = existing.jira_synced_at or datetime.min.replace(tzinfo=timezone.utc)
        local_updated = existing.updated_at
        if local_updated.tzinfo is None:
            local_updated = local_updated.replace(tzinfo=timezone.utc)
        if local_updated <= last_synced:
            for k, v in mapped.items():
                setattr(existing, k, v)
    else:
        new_epic = Epic(
            **mapped,
            project_id=config.zeno_project_id,
            created_by=config.user_id,
        )
        db.add(new_epic)
        try:
            db.flush()
        except Exception:
            db.rollback()
            logger.debug("Skipping duplicate epic %s", jira_key)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def send_periodic_reports(self, frequency: str):
    """Generate and send all active periodic reports for the given frequency."""
    from app.models.report import ReportConfig
    from app.services.report_service import SyncReportService, report_data_to_json
    from app.services.pdf_generator import PDFGenerator
    import os

    reports_dir = "/tmp/zeno_reports"
    os.makedirs(reports_dir, exist_ok=True)

    try:
        with _SessionLocal() as db:
            configs = db.query(ReportConfig).filter(
                ReportConfig.is_active == True,
                ReportConfig.frequency == frequency,
            ).all()

            for config in configs:
                try:
                    period_from, period_to = _get_report_period(frequency)
                    svc = SyncReportService(db)
                    data = svc.build_report_data(
                        report_type=config.report_type.value,
                        period_from=period_from,
                        period_to=period_to,
                        target_user_id=config.target_user_id,
                        target_project_id=config.target_project_id,
                        target_client_name=config.target_client_name,
                        title=config.name,
                    )

                    pdf_path = os.path.join(reports_dir, f"report_{config.id}_{period_from}.pdf")
                    PDFGenerator().generate(data, pdf_path)

                    # Save to history
                    from app.models.report import ReportHistory
                    history = ReportHistory(
                        config_id=config.id,
                        user_id=config.user_id,
                        report_type=config.report_type,
                        title=config.name,
                        period_from=period_from,
                        period_to=period_to,
                        file_path=pdf_path,
                        data_json=report_data_to_json(data),
                        status="ok",
                    )
                    db.add(history)

                    # Send email if configured
                    if config.send_email:
                        email_to = config.email_to or config.user.email
                        try:
                            from app.services.email_service import send_report_email
                            send_report_email(
                                to=email_to,
                                subject=f"{config.name} — {period_from.strftime('%B %Y')}",
                                data=data,
                                pdf_path=pdf_path,
                            )
                        except Exception as e:
                            logger.warning("Report email failed for config %s: %s", config.id, e)

                    config.last_sent_at = datetime.now(timezone.utc)
                    db.commit()

                except Exception as e:
                    logger.error("Periodic report %s failed: %s", config.id, e)
                    db.rollback()

        logger.info("Periodic %s reports done: %d configs", frequency, len(configs))
    except Exception as exc:
        logger.error("Periodic reports error: %s", exc)
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def run_periodic_report_now(self, config_id: int):
    """Run a single periodic report config immediately (for testing)."""
    from app.models.report import ReportConfig, ReportHistory
    from app.services.report_service import SyncReportService, report_data_to_json
    from app.services.pdf_generator import PDFGenerator
    import os

    reports_dir = "/tmp/zeno_reports"
    os.makedirs(reports_dir, exist_ok=True)

    try:
        with _SessionLocal() as db:
            config = db.get(ReportConfig, config_id)
            if not config:
                return

            period_from, period_to = _get_report_period(config.frequency.value)
            svc = SyncReportService(db)
            data = svc.build_report_data(
                report_type=config.report_type.value,
                period_from=period_from,
                period_to=period_to,
                target_user_id=config.target_user_id,
                target_project_id=config.target_project_id,
                target_client_name=config.target_client_name,
                title=config.name,
            )

            pdf_path = os.path.join(reports_dir, f"report_{config.id}_{period_from}.pdf")
            PDFGenerator().generate(data, pdf_path)

            history = ReportHistory(
                config_id=config.id,
                user_id=config.user_id,
                report_type=config.report_type,
                title=config.name,
                period_from=period_from,
                period_to=period_to,
                file_path=pdf_path,
                data_json=report_data_to_json(data),
                status="ok",
            )
            db.add(history)

            if config.send_email:
                email_to = config.email_to or config.user.email
                try:
                    from app.services.email_service import send_report_email
                    send_report_email(
                        to=email_to,
                        subject=f"{config.name} — {period_from.strftime('%B %Y')}",
                        data=data,
                        pdf_path=pdf_path,
                    )
                except Exception as e:
                    logger.warning("Report email failed for config %s: %s", config.id, e)

            config.last_sent_at = datetime.now(timezone.utc)
            db.commit()

    except Exception as exc:
        logger.error("Run report now error for config %s: %s", config_id, exc)
        raise self.retry(exc=exc)


def _get_report_period(frequency: str) -> tuple[date, date]:
    """Calculate the report period based on frequency."""
    today = date.today()
    if frequency == "weekly":
        last_monday = today - timedelta(days=today.weekday() + 7)
        last_sunday = last_monday + timedelta(days=6)
        return last_monday, last_sunday
    else:
        first_this_month = today.replace(day=1)
        last_month_end = first_this_month - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        return last_month_start, last_month_end


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def run_tempo_import(self, import_log_id: int, date_from: str, date_to: str, user_id: int):
    """Celery task for async Tempo import (long periods)."""
    from app.models.tempo import TempoImportLog
    from app.services.tempo_import_service import TempoImportService

    try:
        with _SessionLocal() as db:
            import_log = db.get(TempoImportLog, import_log_id)
            if not import_log:
                return

            svc = TempoImportService(db)
            try:
                worklogs = svc._get_chunked_sync(
                    date.fromisoformat(date_from),
                    date.fromisoformat(date_to),
                )
                import_log.worklogs_found = len(worklogs)
                db.commit()

                for wl in worklogs:
                    result = svc._process_worklog(wl)
                    if result == "created":
                        import_log.worklogs_created += 1
                    elif result == "updated":
                        import_log.worklogs_updated += 1
                    elif result == "skipped":
                        import_log.worklogs_skipped += 1

                import_log.status = "ok"
            except Exception as e:
                import_log.status = "error"
                import_log.error_message = str(e)[:500]
            finally:
                import_log.completed_at = datetime.now(timezone.utc)
                db.commit()

    except Exception as exc:
        logger.error("Tempo import task error: %s", exc)
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def auto_sync_tempo(self):
    """Auto-sync Tempo worklogs for previous week. Runs Monday 06:00."""
    from app.models.user import User
    from app.services.tempo_import_service import TempoImportService

    if not settings.TEMPO_API_TOKEN:
        return "Tempo not configured"

    try:
        with _SessionLocal() as db:
            today = date.today()
            last_monday = today - timedelta(days=today.weekday() + 7)
            last_sunday = last_monday + timedelta(days=6)

            admin = db.execute(
                select(User).where(User.is_admin == True)
            ).scalar_one_or_none()
            if not admin:
                return "No admin user found"

            svc = TempoImportService(db)
            log = svc.run_import(last_monday, last_sunday, admin.id)
            return f"Tempo sync: {log.worklogs_created} created, {log.worklogs_updated} updated, {log.worklogs_skipped} skipped"

    except Exception as exc:
        logger.error("Auto tempo sync error: %s", exc)
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def auto_push_to_tempo(self):
    """Nightly push Zeno → Tempo. Runs at 02:00, before import (06:00) and reports (07:00)."""
    from app.models.user import User

    if not settings.TEMPO_API_TOKEN:
        return "Tempo not configured"

    try:
        with _SessionLocal() as db:
            admin = db.execute(
                select(User).where(User.is_admin == True)
            ).scalar_one_or_none()
            if not admin:
                return "No admin user found"

            from app.services.tempo_push_service import TempoPushService
            svc = TempoPushService(db)
            push_log = svc.run_push(admin.id)

            # Notify via Telegram on errors
            if push_log.logs_error > 0 and admin.telegram_chat_id:
                try:
                    from app.services.telegram_service import send_message_sync
                    send_message_sync(
                        admin.telegram_chat_id,
                        (
                            f"⚠️ Push Tempo notturno completato con {push_log.logs_error} errori.\n"
                            f"✅ Pushati: {push_log.logs_pushed}\n"
                            f"❌ Errori: {push_log.logs_error}\n"
                            f"Controlla Impostazioni → Tempo Cloud per i dettagli."
                        ),
                    )
                except Exception as e:
                    logger.warning("Telegram notification failed: %s", e)

            return (
                f"Tempo push: {push_log.logs_pushed} pushed, "
                f"{push_log.logs_updated} updated, {push_log.logs_deleted} deleted, "
                f"{push_log.logs_error} errors"
            )

    except Exception as exc:
        logger.error("Auto tempo push error: %s", exc)
        raise self.retry(exc=exc)


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


@celery_app.task
def expire_pending_invitations():
    """Ogni giorno alle 01:00: marca come 'expired' gli inviti scaduti."""
    from sqlalchemy import update
    from app.models.sharing import ProjectInvitation, InvitationStatus

    with _SessionLocal() as db:
        result = db.execute(
            update(ProjectInvitation)
            .where(ProjectInvitation.status == InvitationStatus.PENDING.value)
            .where(ProjectInvitation.expires_at < datetime.now(timezone.utc))
            .values(status=InvitationStatus.EXPIRED.value)
        )
        db.commit()
        return f"Scaduti {result.rowcount} inviti"


@celery_app.task
def check_due_soon():
    """Ogni mattina alle 08:00: notifica i task in scadenza oggi o domani."""
    from app.models.task import Task, TaskStatus
    from app.models.project import Project
    from app.services.notification_service import NotificationService
    from app.models.sharing import NotificationType

    with _SessionLocal() as db:
        today = date.today()
        tomorrow = today + timedelta(days=1)

        tasks = db.execute(
            select(Task).where(
                Task.due_date.in_([today, tomorrow]),
                Task.status != TaskStatus.DONE,
                Task.assigned_to.isnot(None),
            )
        ).scalars().all()

        svc = NotificationService(db)
        for task in tasks:
            when = "oggi" if task.due_date == today else "domani"
            project = db.get(Project, task.project_id) if task.project_id else None
            project_name = project.name if project else ""
            svc.notify(
                user_id=task.assigned_to,
                type=NotificationType.TASK_DUE_SOON,
                title=f"Task in scadenza {when}",
                body=f"'{task.title}'" + (f" nel progetto {project_name}" if project_name else ""),
                task_id=task.id,
                project_id=task.project_id,
            )
        db.commit()
        return f"Notificati {len(tasks)} task in scadenza"
