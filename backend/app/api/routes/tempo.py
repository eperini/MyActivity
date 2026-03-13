"""Tempo Cloud API endpoints — import worklogs, manage ghost users, config."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.time_log import TimeLog
from app.models.tempo import TempoUser, TempoImportLog

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
