from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.user import User
from app.models.epic import Epic
from app.models.time_log import TimeLog
from app.models.project import Project
from app.models.jira import JiraConfig
from app.models.tempo import TempoUser

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────

def format_minutes(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    if h and m:
        return f"{h}h {m}m"
    elif h:
        return f"{h}h"
    return f"{m}m"


async def _check_project_access(project_id: int, user_id: int, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Progetto non trovato")
    return project


async def _get_epic_or_404(epic_id: int, db: AsyncSession) -> Epic:
    epic = await db.get(Epic, epic_id)
    if not epic:
        raise HTTPException(404, "Epic non trovato")
    return epic


async def _enrich_epic(epic: Epic, db: AsyncSession) -> dict:
    result = await db.execute(
        select(
            func.coalesce(func.sum(TimeLog.minutes), 0),
            func.max(TimeLog.logged_at),
        ).where(TimeLog.epic_id == epic.id)
    )
    total_minutes, last_log_date = result.one()

    return {
        "id": epic.id,
        "project_id": epic.project_id,
        "name": epic.name,
        "description": epic.description,
        "status": epic.status,
        "color": epic.color,
        "start_date": epic.start_date.isoformat() if epic.start_date else None,
        "target_date": epic.target_date.isoformat() if epic.target_date else None,
        "completed_at": epic.completed_at.isoformat() if epic.completed_at else None,
        "jira_issue_key": epic.jira_issue_key,
        "jira_url": epic.jira_url,
        "jira_synced_at": epic.jira_synced_at.isoformat() if epic.jira_synced_at else None,
        "position": epic.position,
        "total_logged_minutes": int(total_minutes),
        "total_logged_formatted": format_minutes(int(total_minutes)) if total_minutes > 0 else "—",
        "last_log_date": last_log_date.isoformat() if last_log_date else None,
        "created_at": epic.created_at.isoformat(),
        "updated_at": epic.updated_at.isoformat(),
    }


# ── Schemas ──────────────────────────────────────────────────────────

class EpicCreate(BaseModel):
    name: str = Field(..., max_length=500)
    description: str | None = None
    color: str | None = Field(None, pattern=r'^#[0-9a-fA-F]{6}$')
    start_date: date | None = None
    target_date: date | None = None
    push_to_jira: bool = False


class EpicUpdate(BaseModel):
    name: str | None = Field(None, max_length=500)
    description: str | None = None
    status: str | None = None
    color: str | None = None
    start_date: date | None = None
    target_date: date | None = None


class TimeLogCreate(BaseModel):
    minutes: int = Field(..., gt=0, le=1440)
    logged_at: date = Field(default_factory=date.today)
    note: str | None = Field(None, max_length=500)


class TimeLogOut(BaseModel):
    id: int
    epic_id: int | None
    task_id: int | None
    user_id: int | None
    user_name: str
    logged_at: date
    minutes: int
    formatted: str
    note: str | None
    source: str = "manual"
    tempo_push_status: str | None = None
    tempo_push_error: str | None = None
    jira_issue_key: str | None = None
    created_at: str


# ── Epic CRUD ────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/epics")
async def list_epics(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    result = await db.execute(
        select(Epic)
        .where(Epic.project_id == project_id)
        .order_by(Epic.position, Epic.created_at)
    )
    epics = result.scalars().all()
    return [await _enrich_epic(e, db) for e in epics]


@router.post("/projects/{project_id}/epics")
async def create_epic(
    project_id: int,
    body: EpicCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)

    epic = Epic(
        project_id=project_id,
        name=body.name,
        description=body.description,
        color=body.color,
        start_date=body.start_date,
        target_date=body.target_date,
        created_by=user.id,
    )
    db.add(epic)
    await db.flush()

    if body.push_to_jira:
        config_result = await db.execute(
            select(JiraConfig).where(JiraConfig.zeno_project_id == project_id)
        )
        config = config_result.scalar_one_or_none()
        if config:
            from app.services.jira_service import JiraService
            try:
                jira = JiraService()
                result = await jira.create_epic(
                    config.jira_project_key,
                    name=epic.name,
                    description=epic.description or "",
                )
                epic.jira_issue_key = result["key"]
                epic.jira_issue_id = result["id"]
                epic.jira_url = f"{settings.JIRA_BASE_URL}/browse/{result['key']}"
                epic.jira_synced_at = datetime.now(timezone.utc)
            except Exception as e:
                # Epic created in Zeno but Jira push failed — not critical
                pass

    await db.commit()
    await db.refresh(epic)
    return await _enrich_epic(epic, db)


@router.get("/projects/{project_id}/epics/{epic_id}")
async def get_epic(
    project_id: int,
    epic_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    epic = await _get_epic_or_404(epic_id, db)
    if epic.project_id != project_id:
        raise HTTPException(404, "Epic non trovato in questo progetto")
    return await _enrich_epic(epic, db)


@router.patch("/projects/{project_id}/epics/{epic_id}")
async def update_epic(
    project_id: int,
    epic_id: int,
    body: EpicUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    epic = await _get_epic_or_404(epic_id, db)
    if epic.project_id != project_id:
        raise HTTPException(404, "Epic non trovato in questo progetto")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(epic, field, value)

    if body.status == "done" and not epic.completed_at:
        epic.completed_at = datetime.now(timezone.utc)
    elif body.status and body.status != "done":
        epic.completed_at = None

    await db.commit()
    await db.refresh(epic)
    return await _enrich_epic(epic, db)


@router.delete("/projects/{project_id}/epics/{epic_id}")
async def delete_epic(
    project_id: int,
    epic_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    epic = await _get_epic_or_404(epic_id, db)
    if epic.project_id != project_id:
        raise HTTPException(404, "Epic non trovato in questo progetto")
    await db.delete(epic)
    await db.commit()
    return {"detail": "Epic eliminato"}


@router.post("/projects/{project_id}/epics/{epic_id}/push-jira")
async def push_epic_to_jira(
    project_id: int,
    epic_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    epic = await _get_epic_or_404(epic_id, db)
    if epic.project_id != project_id:
        raise HTTPException(404, "Epic non trovato in questo progetto")

    if epic.jira_issue_key:
        raise HTTPException(400, "Epic già collegato a Jira")

    config_result = await db.execute(
        select(JiraConfig).where(JiraConfig.zeno_project_id == project_id)
    )
    config = config_result.scalar_one_or_none()
    if not config:
        raise HTTPException(400, "Progetto non configurato per Jira")

    from app.services.jira_service import JiraService
    jira = JiraService()
    try:
        result = await jira.create_epic(
            config.jira_project_key,
            name=epic.name,
            description=epic.description or "",
        )
        epic.jira_issue_key = result["key"]
        epic.jira_issue_id = result["id"]
        epic.jira_url = f"{settings.JIRA_BASE_URL}/browse/{result['key']}"
        epic.jira_synced_at = datetime.now(timezone.utc)
        await db.commit()
        return await _enrich_epic(epic, db)
    except Exception as e:
        raise HTTPException(502, f"Errore creazione Epic su Jira: {e}")


@router.patch("/projects/{project_id}/epics/reorder")
async def reorder_epics(
    project_id: int,
    epic_ids: list[int],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    for i, eid in enumerate(epic_ids):
        epic = await db.get(Epic, eid)
        if epic and epic.project_id == project_id:
            epic.position = i
    await db.commit()
    return {"detail": "Riordinato"}


# ── Epic Time Logs ───────────────────────────────────────────────────

@router.get("/epics/{epic_id}/time")
async def get_epic_time_logs(
    epic_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    epic = await _get_epic_or_404(epic_id, db)

    result = await db.execute(
        select(TimeLog, User.display_name, TempoUser.display_name)
        .outerjoin(User, TimeLog.user_id == User.id)
        .outerjoin(TempoUser, TimeLog.tempo_user_id == TempoUser.id)
        .where(TimeLog.epic_id == epic_id)
        .order_by(TimeLog.logged_at.desc(), TimeLog.created_at.desc())
    )
    rows = result.all()
    return [
        TimeLogOut(
            id=log.id,
            epic_id=log.epic_id,
            task_id=log.task_id,
            user_id=log.user_id,
            user_name=user_name or tempo_name or "Utente sconosciuto",
            logged_at=log.logged_at,
            minutes=log.minutes,
            formatted=format_minutes(log.minutes),
            note=log.note,
            source=log.source or "manual",
            tempo_push_status=log.tempo_push_status,
            tempo_push_error=log.tempo_push_error,
            jira_issue_key=epic.jira_issue_key,
            created_at=log.created_at.isoformat(),
        )
        for log, user_name, tempo_name in rows
    ]


@router.post("/epics/{epic_id}/time")
async def create_epic_time_log(
    epic_id: int,
    body: TimeLogCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    epic = await _get_epic_or_404(epic_id, db)

    log = TimeLog(
        epic_id=epic.id,
        task_id=None,
        user_id=user.id,
        logged_at=body.logged_at,
        minutes=body.minutes,
        note=body.note,
        source="manual",
        tempo_push_status="pending",
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return TimeLogOut(
        id=log.id,
        epic_id=log.epic_id,
        task_id=None,
        user_id=log.user_id,
        user_name=user.display_name,
        logged_at=log.logged_at,
        minutes=log.minutes,
        formatted=format_minutes(log.minutes),
        note=log.note,
        source="manual",
        tempo_push_status=log.tempo_push_status,
        jira_issue_key=epic.jira_issue_key,
        created_at=log.created_at.isoformat(),
    )


@router.delete("/epics/{epic_id}/time/{log_id}")
async def delete_epic_time_log(
    epic_id: int,
    log_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_epic_or_404(epic_id, db)
    log = await db.get(TimeLog, log_id)
    if not log or log.epic_id != epic_id:
        raise HTTPException(404, "Log non trovato")
    if log.user_id != user.id:
        raise HTTPException(403, "Puoi eliminare solo i tuoi log")
    await db.delete(log)
    await db.commit()
    return {"detail": "Log eliminato"}


# ── Quick Log endpoint ───────────────────────────────────────────────

@router.get("/quick-log/epics")
async def quick_log_epics(
    status: str | None = Query(None),
    project_id: int | None = Query(None),
    only_with_jira: bool = Query(False),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all epics grouped by project for the Quick Log view."""
    query = (
        select(Epic, Project.name, JiraConfig.jira_project_key)
        .join(Project, Epic.project_id == Project.id)
        .outerjoin(JiraConfig, JiraConfig.zeno_project_id == Project.id)
        .order_by(Project.name, Epic.position, Epic.created_at)
    )

    if project_id:
        query = query.where(Epic.project_id == project_id)
    if status:
        query = query.where(Epic.status == status)
    if only_with_jira:
        query = query.where(Epic.jira_issue_key.isnot(None))

    result = await db.execute(query)
    rows = result.all()

    # Group by project
    projects: dict[int, dict] = {}
    for epic, project_name, jira_key in rows:
        pid = epic.project_id
        if pid not in projects:
            projects[pid] = {
                "project_id": pid,
                "project_name": project_name,
                "jira_key": jira_key or "",
                "epics": [],
            }

        # Get time totals for this epic
        time_result = await db.execute(
            select(
                func.coalesce(func.sum(TimeLog.minutes), 0),
                func.max(TimeLog.logged_at),
            ).where(TimeLog.epic_id == epic.id)
        )
        total_minutes, last_log_date = time_result.one()

        projects[pid]["epics"].append({
            "id": epic.id,
            "name": epic.name,
            "description": epic.description,
            "status": epic.status,
            "color": epic.color,
            "jira_issue_key": epic.jira_issue_key,
            "jira_url": epic.jira_url,
            "position": epic.position,
            "total_logged_minutes": int(total_minutes),
            "total_logged_formatted": format_minutes(int(total_minutes)) if total_minutes > 0 else "—",
            "last_log_date": last_log_date.isoformat() if last_log_date else None,
            "start_date": epic.start_date.isoformat() if epic.start_date else None,
            "target_date": epic.target_date.isoformat() if epic.target_date else None,
            "created_at": epic.created_at.isoformat(),
            "updated_at": epic.updated_at.isoformat(),
        })

    return list(projects.values())
