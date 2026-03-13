"""Tempo Cloud API endpoints — import/push worklogs, manage ghost users, config."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.time_log import TimeLog
from app.models.tempo import TempoUser, TempoImportLog, TempoPushLog

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────

class TempoImportRequest(BaseModel):
    date_from: date
    date_to: date

    @model_validator(mode="after")
    def validate_period(self):
        if self.date_to < self.date_from:
            raise ValueError("date_to deve essere >= date_from")
        if (self.date_to - self.date_from).days > 365:
            raise ValueError("Il periodo massimo per un import manuale è 365 giorni")
        return self


class TempoUserUpdate(BaseModel):
    zeno_user_id: int | None = None


class TempoConfigUpdate(BaseModel):
    sync_interval_days: int | None = None


def _require_admin(user: User):
    if not user.is_admin:
        raise HTTPException(403, "Solo gli admin possono gestire Tempo")


def _fmt_minutes(m: int) -> str:
    h, mn = divmod(m, 60)
    return f"{h}h {mn}m" if mn else f"{h}h"


# ── Tempo Users ──────────────────────────────────────────────────────

@router.get("/tempo/users")
async def get_tempo_users(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    result = await db.execute(select(TempoUser).order_by(TempoUser.display_name))
    users = result.scalars().all()

    out = []
    for tu in users:
        count_result = await db.execute(
            select(func.count(), func.coalesce(func.sum(TimeLog.minutes), 0))
            .select_from(TimeLog)
            .where(TimeLog.tempo_user_id == tu.id)
        )
        row = count_result.one()
        total_logs = row[0]
        total_minutes = row[1]
        out.append({
            "id": tu.id,
            "tempo_account_id": tu.tempo_account_id,
            "display_name": tu.display_name,
            "email": tu.email,
            "zeno_user_id": tu.zeno_user_id,
            "is_active": tu.is_active,
            "total_logs": total_logs,
            "total_minutes": total_minutes,
            "total_formatted": _fmt_minutes(total_minutes),
        })
    return out


@router.patch("/tempo/users/{user_id}")
async def update_tempo_user(
    user_id: int,
    data: TempoUserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    tu = await db.get(TempoUser, user_id)
    if not tu:
        raise HTTPException(404, "Utente Tempo non trovato")

    tu.zeno_user_id = data.zeno_user_id

    # Retroactively update all time_logs for this tempo user
    if data.zeno_user_id is not None:
        result = await db.execute(
            select(TimeLog).where(TimeLog.tempo_user_id == tu.id)
        )
        logs = result.scalars().all()
        for log in logs:
            log.user_id = data.zeno_user_id
            log.tempo_user_id = None  # linked to real user now
    else:
        # Unlink: restore tempo_user_id for logs that had it
        result = await db.execute(
            select(TimeLog).where(
                TimeLog.source == "tempo",
                TimeLog.tempo_worklog_id.isnot(None),
                TimeLog.user_id == tu.zeno_user_id if tu.zeno_user_id else False,
            )
        )

    await db.commit()
    return {"detail": "Utente Tempo aggiornato"}


@router.patch("/tempo/users/{user_id}/deactivate")
async def deactivate_tempo_user(
    user_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    tu = await db.get(TempoUser, user_id)
    if not tu:
        raise HTTPException(404, "Utente Tempo non trovato")
    tu.is_active = not tu.is_active
    await db.commit()
    return {"detail": f"Utente {'attivato' if tu.is_active else 'disattivato'}"}


# ── Import ───────────────────────────────────────────────────────────

@router.post("/tempo/import")
async def trigger_tempo_import(
    req: TempoImportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)

    if not settings.TEMPO_API_TOKEN:
        raise HTTPException(400, "Tempo non configurato (token mancante)")

    delta_days = (req.date_to - req.date_from).days

    if delta_days <= 30:
        # Synchronous import for short periods
        # We need a sync session for the import service
        from app.workers.tasks import _SessionLocal
        with _SessionLocal() as sync_db:
            from app.services.tempo_import_service import TempoImportService
            svc = TempoImportService(sync_db)
            log = svc.run_import(req.date_from, req.date_to, user.id)
            return {
                "import_log_id": log.id,
                "status": log.status,
                "period_from": log.period_from.isoformat(),
                "period_to": log.period_to.isoformat(),
                "worklogs_found": log.worklogs_found,
                "worklogs_created": log.worklogs_created,
                "worklogs_updated": log.worklogs_updated,
                "worklogs_skipped": log.worklogs_skipped,
                "error_message": log.error_message,
            }
    else:
        # Async via Celery for long periods
        import_log = TempoImportLog(
            triggered_by=user.id,
            period_from=req.date_from,
            period_to=req.date_to,
            status="running",
        )
        db.add(import_log)
        await db.commit()
        await db.refresh(import_log)

        from app.workers.tasks import run_tempo_import
        run_tempo_import.delay(
            import_log_id=import_log.id,
            date_from=req.date_from.isoformat(),
            date_to=req.date_to.isoformat(),
            user_id=user.id,
        )
        return {
            "import_log_id": import_log.id,
            "status": "running",
            "period_from": req.date_from.isoformat(),
            "period_to": req.date_to.isoformat(),
        }


@router.get("/tempo/import/history")
async def get_tempo_import_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    result = await db.execute(
        select(TempoImportLog)
        .order_by(TempoImportLog.started_at.desc())
        .limit(50)
    )
    logs = result.scalars().all()
    return [{
        "id": l.id,
        "triggered_by": l.triggered_by,
        "period_from": l.period_from.isoformat() if l.period_from else None,
        "period_to": l.period_to.isoformat() if l.period_to else None,
        "status": l.status,
        "worklogs_found": l.worklogs_found,
        "worklogs_created": l.worklogs_created,
        "worklogs_updated": l.worklogs_updated,
        "worklogs_skipped": l.worklogs_skipped,
        "error_message": l.error_message,
        "started_at": l.started_at.isoformat() if l.started_at else None,
        "completed_at": l.completed_at.isoformat() if l.completed_at else None,
    } for l in logs]


@router.get("/tempo/import/history/{log_id}")
async def get_tempo_import_detail(
    log_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    log = await db.get(TempoImportLog, log_id)
    if not log:
        raise HTTPException(404, "Import log non trovato")
    return {
        "id": log.id,
        "triggered_by": log.triggered_by,
        "period_from": log.period_from.isoformat() if log.period_from else None,
        "period_to": log.period_to.isoformat() if log.period_to else None,
        "status": log.status,
        "worklogs_found": log.worklogs_found,
        "worklogs_created": log.worklogs_created,
        "worklogs_updated": log.worklogs_updated,
        "worklogs_skipped": log.worklogs_skipped,
        "error_message": log.error_message,
        "started_at": log.started_at.isoformat() if log.started_at else None,
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
    }


# ── Config ───────────────────────────────────────────────────────────

@router.get("/tempo/config")
async def get_tempo_config(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)

    # Count tempo users and imported logs
    users_count = await db.execute(select(func.count()).select_from(TempoUser))
    logs_count = await db.execute(
        select(func.count()).select_from(TimeLog).where(TimeLog.source == "tempo")
    )

    # Last auto sync
    last_sync = await db.execute(
        select(TempoImportLog)
        .order_by(TempoImportLog.started_at.desc())
        .limit(1)
    )
    last = last_sync.scalar_one_or_none()

    return {
        "is_configured": bool(settings.TEMPO_API_TOKEN),
        "sync_interval_days": settings.TEMPO_SYNC_INTERVAL_DAYS,
        "last_auto_sync_at": last.started_at.isoformat() if last and last.started_at else None,
        "last_auto_sync_status": last.status if last else None,
        "total_tempo_users": users_count.scalar() or 0,
        "total_imported_logs": logs_count.scalar() or 0,
    }


@router.post("/tempo/test-connection")
async def test_tempo_connection(
    user: User = Depends(get_current_user),
):
    _require_admin(user)

    if not settings.TEMPO_API_TOKEN:
        raise HTTPException(400, "Tempo non configurato (token mancante)")

    from app.services.tempo_service import TempoService
    try:
        result = await TempoService().test_connection()
        return result
    except Exception as e:
        status_code = 502
        detail = f"Errore connessione Tempo: {e}"
        if "401" in str(e):
            detail = "Token Tempo non valido (401 Unauthorized)"
            status_code = 401
        raise HTTPException(status_code=status_code, detail=detail)


# ── Push Zeno → Tempo ────────────────────────────────────────────────

@router.post("/tempo/push")
async def trigger_tempo_push(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)

    if not settings.TEMPO_API_TOKEN:
        raise HTTPException(400, "Tempo non configurato (token mancante)")

    from app.workers.tasks import _SessionLocal
    with _SessionLocal() as sync_db:
        from app.services.tempo_push_service import TempoPushService
        svc = TempoPushService(sync_db)
        log = svc.run_push(user.id)
        return {
            "push_log_id": log.id,
            "status": log.status,
            "logs_found": log.logs_found,
            "logs_pushed": log.logs_pushed,
            "logs_updated": log.logs_updated,
            "logs_deleted": log.logs_deleted,
            "logs_skipped": log.logs_skipped,
            "logs_error": log.logs_error,
            "error_message": log.error_message,
        }


@router.get("/tempo/push/history")
async def get_tempo_push_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    result = await db.execute(
        select(TempoPushLog)
        .order_by(TempoPushLog.started_at.desc())
        .limit(50)
    )
    logs = result.scalars().all()
    return [{
        "id": l.id,
        "triggered_by": l.triggered_by,
        "status": l.status,
        "logs_found": l.logs_found,
        "logs_pushed": l.logs_pushed,
        "logs_updated": l.logs_updated,
        "logs_deleted": l.logs_deleted,
        "logs_skipped": l.logs_skipped,
        "logs_error": l.logs_error,
        "error_message": l.error_message,
        "started_at": l.started_at.isoformat() if l.started_at else None,
        "completed_at": l.completed_at.isoformat() if l.completed_at else None,
    } for l in logs]


@router.get("/tempo/push/pending")
async def get_tempo_push_pending(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)
    result = await db.execute(
        select(TimeLog, Task.title, Task.jira_issue_key)
        .join(Task, TimeLog.task_id == Task.id)
        .where(
            TimeLog.source == "manual",
            TimeLog.tempo_push_status.in_(["pending", "error"]),
        )
        .order_by(TimeLog.logged_at.desc())
    )
    rows = result.all()
    logs = []
    for log, task_title, jira_key in rows:
        logs.append({
            "log_id": log.id,
            "task_id": log.task_id,
            "task_title": task_title,
            "jira_issue_key": jira_key,
            "logged_at": log.logged_at.isoformat() if log.logged_at else None,
            "minutes": log.minutes,
            "status": log.tempo_push_status,
            "error": log.tempo_push_error,
            "has_jira": bool(jira_key),
        })
    return {"total": len(logs), "logs": logs}


# ── Skip / Push-now single log ───────────────────────────────────────

@router.patch("/time-logs/{log_id}/skip-tempo")
async def skip_tempo_push(
    log_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    log = await db.get(TimeLog, log_id)
    if not log:
        raise HTTPException(404, "Log non trovato")
    log.tempo_push_status = "skipped"
    await db.commit()
    return {"detail": "Log marcato come ignorato per Tempo"}


@router.patch("/time-logs/{log_id}/push-now")
async def push_log_now(
    log_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)

    if not settings.TEMPO_API_TOKEN:
        raise HTTPException(400, "Tempo non configurato")

    log = await db.get(TimeLog, log_id)
    if not log:
        raise HTTPException(404, "Log non trovato")

    task = await db.get(Task, log.task_id)
    if not task:
        raise HTTPException(404, "Task non trovato")

    # If task has no jira_issue_key, try to create the issue on Jira
    if not task.jira_issue_key:
        from app.models.jira import JiraConfig
        config_result = await db.execute(
            select(JiraConfig).where(JiraConfig.zeno_project_id == task.project_id)
        )
        config = config_result.scalar_one_or_none()
        if not config:
            raise HTTPException(400, "Progetto non configurato per Jira — impossibile pushare")

        from app.services.jira_service import JiraService
        try:
            jira = JiraService()
            result = await jira.create_issue(
                config.jira_project_key,
                {
                    "title": task.title,
                    "description": task.description,
                    "priority": task.priority,
                    "due_date": str(task.due_date) if task.due_date else None,
                },
            )
            task.jira_issue_key = result["key"]
            task.jira_issue_id = result["id"]
            task.jira_url = f"{settings.JIRA_BASE_URL}/browse/{result['key']}"
            await db.flush()
        except Exception as e:
            raise HTTPException(502, f"Errore creazione issue Jira: {e}")

    # Now push the worklog
    if not user.jira_account_id:
        raise HTTPException(400, "Account Jira non collegato — vai in Impostazioni → Jira")

    from app.services.tempo_service import TempoService
    from datetime import datetime, timezone as tz
    tempo = TempoService()

    try:
        if log.tempo_worklog_id:
            await tempo.update_worklog(
                tempo_worklog_id=log.tempo_worklog_id,
                time_spent_seconds=log.minutes * 60,
                started_date=log.logged_at,
                description=log.note or "",
            )
        else:
            result = await tempo.create_worklog(
                jira_issue_key=task.jira_issue_key,
                author_account_id=user.jira_account_id,
                started_date=log.logged_at,
                time_spent_seconds=log.minutes * 60,
                description=log.note or "",
            )
            log.tempo_worklog_id = result["tempoWorklogId"]

        log.tempo_push_status = "pushed"
        log.tempo_pushed_at = datetime.now(tz.utc)
        log.tempo_push_error = None
        await db.commit()

        return {
            "log_id": log.id,
            "tempo_worklog_id": log.tempo_worklog_id,
            "jira_issue_key": task.jira_issue_key,
            "status": "pushed",
        }
    except Exception as e:
        log.tempo_push_status = "error"
        log.tempo_push_error = str(e)[:300]
        await db.commit()
        raise HTTPException(502, f"Errore push Tempo: {e}")
