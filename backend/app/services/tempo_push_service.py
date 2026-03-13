"""Tempo push service — push Zeno manual time logs to Tempo Cloud."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.user import User
from app.models.time_log import TimeLog, TimeLogDeleted
from app.models.tempo import TempoPushLog
from app.services.tempo_service import TempoService

logger = logging.getLogger(__name__)


class TempoPushService:

    def __init__(self, db: Session):
        self.db = db
        self.tempo = TempoService()

    def run_push(self, triggered_by_user_id: int) -> TempoPushLog:
        push_log = TempoPushLog(
            triggered_by=triggered_by_user_id,
            status="running",
        )
        self.db.add(push_log)
        self.db.commit()

        try:
            to_push = self._get_logs_to_push()
            push_log.logs_found = len(to_push)

            for log in to_push:
                result = self._push_single_log(log)
                if result == "pushed":
                    push_log.logs_pushed += 1
                elif result == "updated":
                    push_log.logs_updated += 1
                elif result == "skipped":
                    push_log.logs_skipped += 1
                elif result == "error":
                    push_log.logs_error += 1

            deleted_count = self._sync_deletions()
            push_log.logs_deleted = deleted_count

            push_log.status = "partial" if push_log.logs_error > 0 else "ok"

        except Exception as e:
            logger.error("Tempo push error: %s", e)
            push_log.status = "error"
            push_log.error_message = str(e)[:500]
            self.db.rollback()
            self.db.add(push_log)

        finally:
            push_log.completed_at = datetime.now(timezone.utc)
            self.db.commit()

        return push_log

    def _get_logs_to_push(self) -> list[TimeLog]:
        return (
            self.db.query(TimeLog)
            .filter(
                TimeLog.source == "manual",
                TimeLog.tempo_push_status.in_(["pending", "error"]),
            )
            .all()
        )

    def _push_single_log(self, log: TimeLog) -> str:
        task = self.db.get(Task, log.task_id)

        if not task or not task.jira_issue_key:
            return "skipped"

        user = self.db.get(User, log.user_id) if log.user_id else None
        if not user or not user.jira_account_id:
            log.tempo_push_status = "error"
            log.tempo_push_error = "Utente senza jira_account_id configurato"
            self.db.flush()
            return "error"

        time_spent_seconds = log.minutes * 60

        try:
            if log.tempo_worklog_id:
                self.tempo.update_worklog_sync(
                    tempo_worklog_id=log.tempo_worklog_id,
                    time_spent_seconds=time_spent_seconds,
                    started_date=log.logged_at,
                    description=log.note or "",
                )
                log.tempo_push_status = "pushed"
                log.tempo_pushed_at = datetime.now(timezone.utc)
                log.tempo_push_error = None
                self.db.flush()
                return "updated"
            else:
                result = self.tempo.create_worklog_sync(
                    jira_issue_key=task.jira_issue_key,
                    author_account_id=user.jira_account_id,
                    started_date=log.logged_at,
                    time_spent_seconds=time_spent_seconds,
                    description=log.note or "",
                )
                log.tempo_worklog_id = result["tempoWorklogId"]
                log.tempo_push_status = "pushed"
                log.tempo_pushed_at = datetime.now(timezone.utc)
                log.tempo_push_error = None
                self.db.flush()
                return "pushed"

        except Exception as e:
            log.tempo_push_status = "error"
            log.tempo_push_error = str(e)[:300]
            self.db.flush()
            return "error"

    def _sync_deletions(self) -> int:
        deleted = (
            self.db.query(TimeLogDeleted)
            .filter(
                TimeLogDeleted.synced_to_tempo == False,
                TimeLogDeleted.tempo_worklog_id.isnot(None),
            )
            .all()
        )

        count = 0
        for entry in deleted:
            try:
                self.tempo.delete_worklog_sync(entry.tempo_worklog_id)
                entry.synced_to_tempo = True
                entry.sync_attempted_at = datetime.now(timezone.utc)
                count += 1
            except Exception as e:
                logger.warning("Failed to delete Tempo worklog %s: %s", entry.tempo_worklog_id, e)
                entry.sync_attempted_at = datetime.now(timezone.utc)
        self.db.flush()
        return count
