from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "myactivity",
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
    },
)
