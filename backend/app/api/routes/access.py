from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task


async def _check_task_access(task: Task, user_id: int, db: AsyncSession) -> None:
    """Verify user has access to a task via project or ownership."""
    if task.project_id:
        from app.api.routes.projects import _check_project_access
        await _check_project_access(task.project_id, user_id, db)
    elif task.created_by != user_id:
        raise HTTPException(status_code=403, detail="Non hai accesso a questo task")
