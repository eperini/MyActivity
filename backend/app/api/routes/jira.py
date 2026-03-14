from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.task_list import TaskList, ListMember
from app.models.jira import JiraConfig, JiraUserMapping
from app.models.project import Project

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────

class JiraConfigCreate(BaseModel):
    jira_project_key: str = Field(..., max_length=50)
    zeno_project_id: int
    default_list_id: int | None = None


class JiraConfigUpdate(BaseModel):
    sync_enabled: bool | None = None
    default_list_id: int | None = None


class JiraConfigOut(BaseModel):
    id: int
    jira_project_key: str
    zeno_project_id: int
    zeno_project_name: str | None = None
    default_list_id: int | None = None
    default_list_name: str | None = None
    sync_enabled: bool
    last_sync_at: str | None = None
    last_sync_status: str | None = None
    last_sync_error: str | None = None
    task_count_synced: int = 0


# ── Config CRUD ──────────────────────────────────────────────────────

@router.get("/jira/config", response_model=list[JiraConfigOut])
async def get_jira_configs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JiraConfig, Project.name, TaskList.name)
        .outerjoin(Project, JiraConfig.zeno_project_id == Project.id)
        .outerjoin(TaskList, JiraConfig.default_list_id == TaskList.id)
        .where(JiraConfig.user_id == user.id)
    )
    rows = result.all()

    configs = []
    for cfg, proj_name, list_name in rows:
        # Count synced tasks
        count_result = await db.execute(
            select(func.count())
            .select_from(Task)
            .where(
                Task.project_id == cfg.zeno_project_id,
                Task.jira_issue_key.isnot(None),
            )
        )
        count = count_result.scalar() or 0

        configs.append(JiraConfigOut(
            id=cfg.id,
            jira_project_key=cfg.jira_project_key,
            zeno_project_id=cfg.zeno_project_id,
            zeno_project_name=proj_name,
            default_list_id=cfg.default_list_id,
            default_list_name=list_name,
            sync_enabled=cfg.sync_enabled,
            last_sync_at=cfg.last_sync_at.isoformat() if cfg.last_sync_at else None,
            last_sync_status=cfg.last_sync_status,
            last_sync_error=cfg.last_sync_error,
            task_count_synced=count,
        ))
    return configs


@router.post("/jira/config", response_model=JiraConfigOut)
async def create_jira_config(
    data: JiraConfigCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not settings.JIRA_BASE_URL:
        raise HTTPException(status_code=400, detail="Jira non configurato nel server")

    # Verify project access
    project = await db.get(Project, data.zeno_project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Progetto non trovato")

    cfg = JiraConfig(
        user_id=user.id,
        jira_project_key=data.jira_project_key.upper(),
        zeno_project_id=data.zeno_project_id,
        default_list_id=data.default_list_id,
    )
    db.add(cfg)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Mapping già esistente")
    await db.refresh(cfg)

    list_name = None
    if cfg.default_list_id:
        lst = await db.get(TaskList, cfg.default_list_id)
        list_name = lst.name if lst else None

    return JiraConfigOut(
        id=cfg.id,
        jira_project_key=cfg.jira_project_key,
        zeno_project_id=cfg.zeno_project_id,
        zeno_project_name=project.name,
        default_list_id=cfg.default_list_id,
        default_list_name=list_name,
        sync_enabled=cfg.sync_enabled,
        last_sync_at=None,
        last_sync_status=None,
        last_sync_error=None,
        task_count_synced=0,
    )


@router.patch("/jira/config/{config_id}", response_model=JiraConfigOut)
async def update_jira_config(
    config_id: int,
    data: JiraConfigUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = await db.get(JiraConfig, config_id)
    if not cfg or cfg.user_id != user.id:
        raise HTTPException(status_code=404, detail="Config non trovata")
    if data.sync_enabled is not None:
        cfg.sync_enabled = data.sync_enabled
    if data.default_list_id is not None:
        cfg.default_list_id = data.default_list_id
    await db.commit()
    await db.refresh(cfg)

    project = await db.get(Project, cfg.zeno_project_id)
    count_result = await db.execute(
        select(func.count())
        .select_from(Task)
        .where(Task.project_id == cfg.zeno_project_id, Task.jira_issue_key.isnot(None))
    )

    return JiraConfigOut(
        id=cfg.id,
        jira_project_key=cfg.jira_project_key,
        zeno_project_id=cfg.zeno_project_id,
        zeno_project_name=project.name if project else None,
        sync_enabled=cfg.sync_enabled,
        last_sync_at=cfg.last_sync_at.isoformat() if cfg.last_sync_at else None,
        last_sync_status=cfg.last_sync_status,
        last_sync_error=cfg.last_sync_error,
        task_count_synced=count_result.scalar() or 0,
    )


@router.delete("/jira/config/{config_id}")
async def delete_jira_config(
    config_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = await db.get(JiraConfig, config_id)
    if not cfg or cfg.user_id != user.id:
        raise HTTPException(status_code=404, detail="Config non trovata")
    await db.delete(cfg)
    await db.commit()
    return {"detail": "Config eliminata"}


@router.post("/jira/config/{config_id}/sync")
async def trigger_jira_sync(
    config_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = await db.get(JiraConfig, config_id)
    if not cfg or cfg.user_id != user.id:
        raise HTTPException(status_code=404, detail="Config non trovata")

    from app.workers.tasks import sync_single_jira_config
    sync_single_jira_config.delay(cfg.id)
    return {"detail": "Sync avviato"}


# ── User Mappings ────────────────────────────────────────────────────


class JiraUserMappingOut(BaseModel):
    id: int
    jira_account_id: str
    jira_display_name: str
    jira_email: str | None
    zeno_user_id: int | None
    zeno_user_name: str | None = None


class JiraUserMappingUpdate(BaseModel):
    jira_account_id: str
    zeno_user_id: int | None


class ZenoUserOut(BaseModel):
    id: int
    display_name: str
    email: str


class JiraUserMappingsResponse(BaseModel):
    mappings: list[JiraUserMappingOut]
    zeno_users: list[ZenoUserOut]


@router.get("/jira/config/{config_id}/users", response_model=JiraUserMappingsResponse)
async def get_jira_user_mappings(
    config_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all user mappings for a Jira config + available Zeno users."""
    cfg = await db.get(JiraConfig, config_id)
    if not cfg or cfg.user_id != user.id:
        raise HTTPException(status_code=404, detail="Config non trovata")

    rows = (await db.execute(
        select(JiraUserMapping, User.display_name)
        .outerjoin(User, JiraUserMapping.zeno_user_id == User.id)
        .where(JiraUserMapping.config_id == config_id)
        .order_by(JiraUserMapping.jira_display_name)
    )).all()

    mappings = [
        JiraUserMappingOut(
            id=m.id,
            jira_account_id=m.jira_account_id,
            jira_display_name=m.jira_display_name,
            jira_email=m.jira_email,
            zeno_user_id=m.zeno_user_id,
            zeno_user_name=uname,
        )
        for m, uname in rows
    ]

    zeno_users_result = (await db.execute(
        select(User).order_by(User.display_name)
    )).scalars().all()

    return JiraUserMappingsResponse(
        mappings=mappings,
        zeno_users=[ZenoUserOut(id=u.id, display_name=u.display_name, email=u.email) for u in zeno_users_result],
    )


@router.post("/jira/config/{config_id}/users/import")
async def import_jira_users(
    config_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch users from Jira project and create/update mappings.
    Auto-maps by email when possible."""
    cfg = await db.get(JiraConfig, config_id)
    if not cfg or cfg.user_id != user.id:
        raise HTTPException(status_code=404, detail="Config non trovata")

    from app.services.jira_service import JiraService
    jira = JiraService()
    jira_users = await jira.get_project_members(cfg.jira_project_key)

    # Load existing mappings
    existing = (await db.execute(
        select(JiraUserMapping).where(JiraUserMapping.config_id == config_id)
    )).scalars().all()
    existing_map = {m.jira_account_id: m for m in existing}

    # Load all Zeno users for auto-mapping by email
    zeno_users = (await db.execute(select(User))).scalars().all()
    email_to_user = {u.email.lower(): u for u in zeno_users}

    imported = 0
    for ju in jira_users:
        account_id = ju["accountId"]
        if account_id in existing_map:
            # Update display name/email if changed
            m = existing_map[account_id]
            m.jira_display_name = ju["displayName"]
            if ju.get("emailAddress"):
                m.jira_email = ju["emailAddress"]
            continue

        # Auto-map by email
        zeno_user_id = None
        jira_email = ju.get("emailAddress")
        if jira_email and jira_email.lower() in email_to_user:
            zeno_user_id = email_to_user[jira_email.lower()].id

        mapping = JiraUserMapping(
            config_id=config_id,
            jira_account_id=account_id,
            jira_display_name=ju["displayName"],
            jira_email=jira_email,
            zeno_user_id=zeno_user_id,
        )
        db.add(mapping)
        imported += 1

    await db.commit()
    return {"detail": f"Importati {imported} utenti, {len(jira_users)} totali"}


@router.patch("/jira/config/{config_id}/users/map")
async def map_jira_user(
    config_id: int,
    data: JiraUserMappingUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Map a Jira user to a Zeno user."""
    cfg = await db.get(JiraConfig, config_id)
    if not cfg or cfg.user_id != user.id:
        raise HTTPException(status_code=404, detail="Config non trovata")

    mapping = (await db.execute(
        select(JiraUserMapping).where(
            JiraUserMapping.config_id == config_id,
            JiraUserMapping.jira_account_id == data.jira_account_id,
        )
    )).scalar_one_or_none()

    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping non trovato")

    if data.zeno_user_id is not None:
        zeno_user = await db.get(User, data.zeno_user_id)
        if not zeno_user:
            raise HTTPException(status_code=404, detail="Utente Zeno non trovato")

    mapping.zeno_user_id = data.zeno_user_id
    await db.commit()
    return {"detail": "Mapping aggiornato"}


@router.get("/jira/projects")
async def get_jira_projects(
    user: User = Depends(get_current_user),
):
    if not settings.JIRA_BASE_URL:
        raise HTTPException(status_code=400, detail="Jira non configurato")
    from app.services.jira_service import JiraService
    jira = JiraService()
    try:
        projects = await jira.get_projects()
        return {"projects": projects}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Errore connessione Jira: {e}")


# ── Task-level Jira endpoints ────────────────────────────────────────

@router.post("/tasks/{task_id}/jira/push")
async def push_task_to_jira(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # DISABLED: Jira push temporarily disabled until stable
    raise HTTPException(status_code=503, detail="Push verso Jira temporaneamente disabilitato")

    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")

    # Verify access
    from app.api.routes.access import _check_task_access
    await _check_task_access(task, user.id, db)

    if not task.project_id:
        raise HTTPException(status_code=400, detail="Task non associato a un progetto")

    # Find jira config for this project
    cfg = await db.scalar(
        select(JiraConfig).where(
            JiraConfig.zeno_project_id == task.project_id,
            JiraConfig.user_id == user.id,
            JiraConfig.sync_enabled == True,
        )
    )
    if not cfg:
        raise HTTPException(status_code=400, detail="Progetto non configurato per Jira sync")

    from app.services.jira_service import JiraService, map_priority_to_jira

    jira = JiraService()

    if task.jira_issue_id:
        # Update existing issue
        await jira.update_issue(task.jira_issue_id, {
            "summary": task.title,
            "priority": {"name": map_priority_to_jira(task.priority)},
        })
        if task.due_date:
            await jira.update_issue(task.jira_issue_id, {
                "duedate": task.due_date.isoformat(),
            })
        await jira.transition_issue(task.jira_issue_id, task.status.value)
    else:
        # Create new issue
        result = await jira.create_issue(
            cfg.jira_project_key,
            {
                "title": task.title,
                "description": task.description,
                "priority": task.priority,
                "due_date": task.due_date.isoformat() if task.due_date else None,
            },
        )
        task.jira_issue_key = result["key"]
        task.jira_issue_id = result["id"]
        task.jira_url = f"{settings.JIRA_BASE_URL}/browse/{result['key']}"

    task.jira_synced_at = datetime.now(timezone.utc)
    await db.commit()
    return {"jira_key": task.jira_issue_key, "jira_url": task.jira_url}


@router.delete("/tasks/{task_id}/jira/unlink")
async def unlink_task_from_jira(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")

    from app.api.routes.access import _check_task_access
    await _check_task_access(task, user.id, db)

    task.jira_issue_key = None
    task.jira_issue_id = None
    task.jira_synced_at = None
    task.jira_url = None
    await db.commit()
    return {"detail": "Task scollegato da Jira"}


@router.get("/tasks/{task_id}/jira/status")
async def get_task_jira_status(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")

    return {
        "jira_issue_key": task.jira_issue_key,
        "jira_issue_id": task.jira_issue_id,
        "jira_url": task.jira_url,
        "jira_synced_at": task.jira_synced_at.isoformat() if task.jira_synced_at else None,
        "linked": task.jira_issue_key is not None,
    }


@router.post("/jira/link-account")
async def link_jira_account(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve and save the current user's Jira account ID."""
    if not settings.JIRA_BASE_URL or not settings.JIRA_EMAIL or not settings.JIRA_API_TOKEN:
        raise HTTPException(400, "Jira non configurato")

    import httpx
    import base64
    auth_str = base64.b64encode(
        f"{settings.JIRA_EMAIL}:{settings.JIRA_API_TOKEN}".encode()
    ).decode()
    headers = {
        "Authorization": f"Basic {auth_str}",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.JIRA_BASE_URL}/rest/api/3/myself",
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise HTTPException(502, f"Errore connessione Jira: {e}")

    user.jira_account_id = data["accountId"]
    await db.commit()
    return {
        "jira_account_id": data["accountId"],
        "display_name": data.get("displayName", ""),
    }
