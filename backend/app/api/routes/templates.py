from datetime import date, time, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.task_list import TaskList, ListMember
from app.models.recurrence import RecurrenceRule
from app.models.template import TaskTemplate

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    priority: int = Field(default=4, ge=1, le=4)
    subtask_titles: list[str] | None = None
    recurrence_config: dict | None = None


class TemplateFromTask(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    priority: int | None = Field(default=None, ge=1, le=4)
    subtask_titles: list[str] | None = None
    recurrence_config: dict | None = None


class InstantiateTemplate(BaseModel):
    list_id: int
    due_date: date | None = None
    due_time: time | None = None


class TemplateResponse(BaseModel):
    id: int
    name: str
    title: str
    description: str | None
    priority: int
    subtask_titles: list[str] | None
    recurrence_config: dict | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=list[TemplateResponse])
async def get_templates(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TaskTemplate)
        .where(TaskTemplate.user_id == user.id)
        .order_by(TaskTemplate.name)
    )
    return result.scalars().all()


@router.post("/", response_model=TemplateResponse)
async def create_template(
    data: TemplateCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = TaskTemplate(
        **data.model_dump(),
        user_id=user.id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.post("/from-task/{task_id}", response_model=TemplateResponse)
async def create_template_from_task(
    task_id: int,
    data: TemplateFromTask,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")

    # Check access
    from app.api.routes.access import _check_task_access
    await _check_task_access(task, user.id, db)

    # Get subtask titles
    subtask_result = await db.execute(
        select(Task.title)
        .where(Task.parent_id == task.id)
        .order_by(Task.position, Task.id)
    )
    subtask_titles = [row[0] for row in subtask_result.all()] or None

    # Get recurrence config
    recurrence_config = None
    rec = await db.execute(
        select(RecurrenceRule).where(RecurrenceRule.task_id == task.id)
    )
    rule = rec.scalar_one_or_none()
    if rule:
        recurrence_config = {
            "rrule": rule.rrule,
            "workday_adjust": rule.workday_adjust,
            "workday_target": rule.workday_target,
        }

    template = TaskTemplate(
        name=data.name,
        user_id=user.id,
        title=task.title,
        description=task.description,
        priority=task.priority,
        subtask_titles=subtask_titles,
        recurrence_config=recurrence_config,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await db.get(TaskTemplate, template_id)
    if not template or template.user_id != user.id:
        raise HTTPException(status_code=404, detail="Template non trovato")
    await db.delete(template)
    await db.commit()
    return {"detail": "Template eliminato"}


@router.post("/{template_id}/instantiate")
async def instantiate_template(
    template_id: int,
    data: InstantiateTemplate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await db.get(TaskTemplate, template_id)
    if not template or template.user_id != user.id:
        raise HTTPException(status_code=404, detail="Template non trovato")

    # Check list access
    task_list = await db.get(TaskList, data.list_id)
    if not task_list:
        raise HTTPException(status_code=404, detail="Lista non trovata")
    if task_list.owner_id != user.id:
        member = await db.execute(
            select(ListMember).where(
                ListMember.list_id == data.list_id,
                ListMember.user_id == user.id,
            )
        )
        if not member.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Non hai accesso a questa lista")

    # Create main task
    task = Task(
        title=template.title,
        description=template.description,
        list_id=data.list_id,
        created_by=user.id,
        priority=template.priority,
        due_date=data.due_date,
        due_time=data.due_time,
    )
    db.add(task)
    await db.flush()

    # Create subtasks
    if template.subtask_titles:
        for i, title in enumerate(template.subtask_titles):
            sub = Task(
                title=title,
                list_id=data.list_id,
                created_by=user.id,
                parent_id=task.id,
                priority=template.priority,
                position=i,
            )
            db.add(sub)

    # Create recurrence
    if template.recurrence_config and template.recurrence_config.get("rrule"):
        rule = RecurrenceRule(
            task_id=task.id,
            rrule=template.recurrence_config["rrule"],
            workday_adjust=template.recurrence_config.get("workday_adjust", "none"),
            workday_target=template.recurrence_config.get("workday_target"),
        )
        db.add(rule)

    await db.commit()
    await db.refresh(task)
    return {
        "id": task.id,
        "title": task.title,
        "list_id": task.list_id,
        "detail": "Task creato da template",
    }
