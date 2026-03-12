from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.automation import AutomationRule, TriggerType, ActionType
from app.api.routes.projects import _check_project_access, _check_project_owner

router = APIRouter()


class AutomationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    trigger_type: TriggerType
    trigger_config: dict = {}
    action_type: ActionType
    action_config: dict = {}


class AutomationUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    trigger_type: TriggerType | None = None
    trigger_config: dict | None = None
    action_type: ActionType | None = None
    action_config: dict | None = None


class AutomationResponse(BaseModel):
    id: int
    project_id: int
    name: str
    is_active: bool
    trigger_type: TriggerType
    trigger_config: dict
    action_type: ActionType
    action_config: dict
    created_at: datetime
    last_triggered: datetime | None

    class Config:
        from_attributes = True


@router.get(
    "/projects/{project_id}/automations",
    response_model=list[AutomationResponse],
)
async def list_automations(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    result = await db.execute(
        select(AutomationRule)
        .where(AutomationRule.project_id == project_id)
        .order_by(AutomationRule.created_at)
    )
    return result.scalars().all()


@router.post(
    "/projects/{project_id}/automations",
    response_model=AutomationResponse,
)
async def create_automation(
    project_id: int,
    data: AutomationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)
    rule = AutomationRule(
        project_id=project_id,
        name=data.name,
        trigger_type=data.trigger_type,
        trigger_config=data.trigger_config,
        action_type=data.action_type,
        action_config=data.action_config,
        created_by=user.id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch(
    "/projects/{project_id}/automations/{rule_id}",
    response_model=AutomationResponse,
)
async def update_automation(
    project_id: int,
    rule_id: int,
    data: AutomationUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)
    rule = await db.get(AutomationRule, rule_id)
    if not rule or rule.project_id != project_id:
        raise HTTPException(status_code=404, detail="Regola non trovata")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/projects/{project_id}/automations/{rule_id}")
async def delete_automation(
    project_id: int,
    rule_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)
    rule = await db.get(AutomationRule, rule_id)
    if not rule or rule.project_id != project_id:
        raise HTTPException(status_code=404, detail="Regola non trovata")
    await db.delete(rule)
    await db.commit()
    return {"detail": "Regola eliminata"}


@router.patch(
    "/projects/{project_id}/automations/{rule_id}/toggle",
    response_model=AutomationResponse,
)
async def toggle_automation(
    project_id: int,
    rule_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)
    rule = await db.get(AutomationRule, rule_id)
    if not rule or rule.project_id != project_id:
        raise HTTPException(status_code=404, detail="Regola non trovata")
    rule.is_active = not rule.is_active
    await db.commit()
    await db.refresh(rule)
    return rule
