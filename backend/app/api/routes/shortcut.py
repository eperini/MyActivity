from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_user_by_api_key
from app.models.user import User
from app.models.task import Task
from app.models.task_list import TaskList
from app.models.tag import Tag, task_tags
from app.services.quickadd_parser import parse_quick_add

router = APIRouter()


class ShortcutTaskRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    list_id: int | None = None


@router.post("/task")
async def create_task_via_shortcut(
    data: ShortcutTaskRequest,
    user: User = Depends(get_user_by_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Create a task via API key (for iOS Shortcuts / Action Button)."""
    parsed = parse_quick_add(data.text)

    if not parsed.title:
        raise HTTPException(400, "Testo vuoto")

    # Use provided list_id or user's first owned list
    list_id = data.list_id
    if list_id:
        # Verify list access
        from app.api.routes.access import _check_list_access
        await _check_list_access(list_id, user.id, db)
    if not list_id:
        result = await db.execute(
            select(TaskList.id).where(TaskList.owner_id == user.id).order_by(TaskList.id).limit(1)
        )
        list_id = result.scalar_one_or_none()
        if not list_id:
            raise HTTPException(400, "Nessuna lista trovata")

    task = Task(
        title=parsed.title,
        list_id=list_id,
        created_by=user.id,
        priority=parsed.priority,
        due_date=parsed.due_date,
        due_time=parsed.due_time,
    )
    db.add(task)
    await db.flush()

    # Resolve tags
    tag_names_out = []
    for tag_name in parsed.tag_names:
        result = await db.execute(
            select(Tag).where(Tag.user_id == user.id, Tag.name == tag_name)
        )
        tag = result.scalar_one_or_none()
        if not tag:
            tag = Tag(name=tag_name, user_id=user.id)
            db.add(tag)
            await db.flush()
        await db.execute(task_tags.insert().values(task_id=task.id, tag_id=tag.id))
        tag_names_out.append(tag_name)

    await db.commit()

    return {
        "id": task.id,
        "title": task.title,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "priority": task.priority,
        "tags": tag_names_out,
    }
