from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.tag import Tag, task_tags
from app.services.quickadd_parser import parse_quick_add

router = APIRouter()


class QuickAddRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    project_id: int


@router.post("/quickadd")
async def quick_add_task(
    data: QuickAddRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify project access
    from app.api.routes.projects import _check_project_access
    await _check_project_access(data.project_id, user.id, db)

    parsed = parse_quick_add(data.text)

    if not parsed.title:
        raise HTTPException(400, "Il titolo del task non può essere vuoto")

    task = Task(
        title=parsed.title,
        project_id=data.project_id,
        created_by=user.id,
        priority=parsed.priority,
        due_date=parsed.due_date,
        due_time=parsed.due_time,
    )
    db.add(task)
    await db.flush()

    # Resolve tags: find or create
    resolved_tags = []
    for tag_name in parsed.tag_names:
        result = await db.execute(
            select(Tag).where(Tag.user_id == user.id, Tag.name == tag_name)
        )
        tag = result.scalar_one_or_none()
        if not tag:
            tag = Tag(name=tag_name, user_id=user.id)
            db.add(tag)
            await db.flush()
        resolved_tags.append(tag)
        await db.execute(task_tags.insert().values(task_id=task.id, tag_id=tag.id))

    await db.commit()
    await db.refresh(task)

    return {
        "id": task.id,
        "title": task.title,
        "project_id": task.project_id,
        "priority": task.priority,
        "status": task.status.value if task.status else "todo",
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "due_time": task.due_time.isoformat() if task.due_time else None,
        "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in resolved_tags],
    }
