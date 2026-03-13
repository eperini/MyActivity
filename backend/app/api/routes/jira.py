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
from app.models.jira import JiraConfig
from app.models.project import Project

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────

class JiraConfigCreate(BaseModel):
    jira_project_key: str = Field(..., max_length=50)
    zeno_project_id: int


class JiraConfigUpdate(BaseModel):
    sync_enabled: bool | None = None


class JiraConfigOut(BaseModel):
    id: int
    jira_project_key: str
    zeno_project_id: int
    zeno_project_name: str | None = None
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
        select(JiraConfig, Project.name)
        .outerjoin(Project, JiraConfig.zeno_project_id == Project.id)
        .where(JiraConfig.user_id == user.id)
    )
    rows = result.all()

    configs = []
    for cfg, proj_name in rows:
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
    )
    db.add(cfg)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Mapping già esistente")
    await db.refresh(cfg)
    return JiraConfigOut(
        id=cfg.id,
        jira_project_key=cfg.jira_project_key,
        zeno_project_id=cfg.zeno_project_id,
        zeno_project_name=project.name,
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
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")

    # Verify list access
    task_list = await db.get(TaskList, task.list_id)
    if task_list and task_list.owner_id != user.id:
        member = await db.execute(
            select(ListMember).where(
                ListMember.list_id == task.list_id, ListMember.user_id == user.id
            )
        )
        if not member.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Non hai accesso")

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

    task_list = await db.get(TaskList, task.list_id)
    if task_list and task_list.owner_id != user.id:
        member = await db.execute(
            select(ListMember).where(
                ListMember.list_id == task.list_id, ListMember.user_id == user.id
            )
        )
        if not member.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Non hai accesso")

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
