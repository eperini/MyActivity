"""Tempo worklog import service — synchronous (for Celery workers)."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.time_log import TimeLog
from app.models.tempo import TempoUser, TempoImportLog
from app.services.tempo_service import TempoService

logger = logging.getLogger(__name__)


class TempoImportService:

    def __init__(self, db: Session):
        self.db = db
        self.tempo = TempoService()

    def run_import(
        self,
        date_from: date,
        date_to: date,
        triggered_by_user_id: int,
    ) -> TempoImportLog:
        import_log = TempoImportLog(
            triggered_by=triggered_by_user_id,
            period_from=date_from,
            period_to=date_to,
            status="running",
        )
        self.db.add(import_log)
        self.db.commit()

        try:
            delta = (date_to - date_from).days
            if delta > 90:
                worklogs = self._get_chunked_sync(date_from, date_to)
            else:
                worklogs = self.tempo.get_worklogs_sync(date_from, date_to)

            import_log.worklogs_found = len(worklogs)

            for wl in worklogs:
                result = self._process_worklog(wl)
                if result == "created":
                    import_log.worklogs_created += 1
                elif result == "updated":
                    import_log.worklogs_updated += 1
                elif result == "skipped":
                    import_log.worklogs_skipped += 1

            import_log.status = "ok"

        except Exception as e:
            logger.error("Tempo import error: %s", e)
            import_log.status = "error"
            import_log.error_message = str(e)[:500]
            self.db.rollback()
            # Re-add import_log after rollback
            self.db.add(import_log)

        finally:
            import_log.completed_at = datetime.now(timezone.utc)
            self.db.commit()

        return import_log

    def _process_worklog(self, wl: dict) -> str:
        tempo_id = wl["tempoWorklogId"]
        jira_key = wl["issue"]["key"]

        # Find the Zeno task matching the Jira issue key
        task = self.db.query(Task).filter(
            Task.jira_issue_key == jira_key
        ).first()

        if not task:
            return "skipped"

        # Resolve Tempo user
        author = wl["author"]
        tempo_user = self._get_or_create_tempo_user(
            account_id=author["accountId"],
            display_name=author["displayName"],
        )

        # Determine effective user_id
        effective_user_id = tempo_user.zeno_user_id
        effective_tempo_user_id = None if tempo_user.zeno_user_id else tempo_user.id

        # Convert seconds to minutes
        minutes = max(1, wl["timeSpentSeconds"] // 60)

        # Upsert based on tempo_worklog_id
        existing = self.db.query(TimeLog).filter(
            TimeLog.tempo_worklog_id == tempo_id
        ).first()

        if existing:
            existing.minutes = minutes
            existing.note = wl.get("description", "") or ""
            existing.logged_at = date.fromisoformat(wl["startDate"])
            existing.tempo_user_id = effective_tempo_user_id
            existing.user_id = effective_user_id
            self.db.flush()
            return "updated"
        else:
            new_log = TimeLog(
                task_id=task.id,
                user_id=effective_user_id,
                tempo_user_id=effective_tempo_user_id,
                logged_at=date.fromisoformat(wl["startDate"]),
                minutes=minutes,
                note=wl.get("description", "") or "",
                source="tempo",
                tempo_worklog_id=tempo_id,
                tempo_push_status="ignored",
            )
            self.db.add(new_log)
            try:
                self.db.flush()
            except Exception:
                self.db.rollback()
                logger.debug("Skipping duplicate tempo worklog %s", tempo_id)
                return "skipped"
            return "created"

    def _get_or_create_tempo_user(
        self, account_id: str, display_name: str
    ) -> TempoUser:
        user = self.db.query(TempoUser).filter(
            TempoUser.tempo_account_id == account_id
        ).first()

        if not user:
            user = TempoUser(
                tempo_account_id=account_id,
                display_name=display_name,
            )
            self.db.add(user)
            self.db.flush()
        elif user.display_name != display_name:
            user.display_name = display_name
            self.db.flush()

        return user

    def _get_chunked_sync(self, date_from: date, date_to: date) -> list[dict]:
        all_worklogs: list[dict] = []
        current = date_from
        while current <= date_to:
            chunk_end = min(current + timedelta(days=89), date_to)
            chunk = self.tempo.get_worklogs_sync(current, chunk_end)
            all_worklogs.extend(chunk)
            current = chunk_end + timedelta(days=1)
        return all_worklogs
