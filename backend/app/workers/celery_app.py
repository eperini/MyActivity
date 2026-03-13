from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "zeno",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    timezone="Europe/Rome",
    enable_utc=True,
    beat_schedule={
        # Controlla ogni minuto se ci sono notifiche da inviare
        "check-notifications": {
            "task": "app.workers.tasks.check_and_send_notifications",
            "schedule": 60.0,
        },
        # Genera le istanze dei task ricorrenti ogni giorno alle 00:05
        "generate-recurring-instances": {
            "task": "app.workers.tasks.generate_recurring_instances",
            "schedule": crontab(hour=0, minute=5),
        },
        # Report giornaliero - controlla ogni 5 minuti se ci sono utenti da notificare
        "send-daily-reports": {
            "task": "app.workers.tasks.send_daily_reports",
            "schedule": 300.0,
        },
        # Backup database su Google Drive ogni giorno alle 03:00
        "backup-database": {
            "task": "app.workers.tasks.backup_database_to_drive",
            "schedule": crontab(hour=3, minute=0),
        },
        # Report ore settimanale (venerdì alle 18:00)
        "weekly-time-report": {
            "task": "app.workers.tasks.send_weekly_time_report",
            "schedule": crontab(hour=18, minute=0, day_of_week=5),
        },
        # Sync Jira projects — DISABLED until stable
        # "sync-jira-projects": {
        #     "task": "app.workers.tasks.sync_jira_projects",
        #     "schedule": crontab(minute=f"*/{settings.JIRA_SYNC_INTERVAL_MINUTES}"),
        # },
        # Push Zeno → Tempo: ogni notte alle 02:00
        "auto-push-to-tempo": {
            "task": "app.workers.tasks.auto_push_to_tempo",
            "schedule": crontab(hour=2, minute=0),
        },
        # Sync Tempo: ogni lunedì alle 06:00 (prima dei report settimanali)
        "auto-sync-tempo": {
            "task": "app.workers.tasks.auto_sync_tempo",
            "schedule": crontab(hour=6, minute=0, day_of_week=1),
        },
        # Report settimanale: ogni lunedì alle 07:00
        "weekly-reports": {
            "task": "app.workers.tasks.send_periodic_reports",
            "schedule": crontab(hour=7, minute=0, day_of_week=1),
            "args": ("weekly",),
        },
        # Report mensile: primo del mese alle 07:00
        "monthly-reports": {
            "task": "app.workers.tasks.send_periodic_reports",
            "schedule": crontab(hour=7, minute=0, day_of_month=1),
            "args": ("monthly",),
        },
    },
)
