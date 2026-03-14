from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.task_list import TaskList, ListMember


async def _check_list_access(list_id: int, user_id: int, db: AsyncSession) -> None:
    """Verify user owns or is member of the list."""
    task_list = await db.get(TaskList, list_id)
    if not task_list:
        raise HTTPException(status_code=404, detail="Lista non trovata")
    if task_list.owner_id != user_id:
        member = await db.execute(
            select(ListMember).where(
                ListMember.list_id == list_id,
                ListMember.user_id == user_id,
            )
        )
        if not member.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Non hai accesso a questa lista")


async def _check_task_access(task: Task, user_id: int, db: AsyncSession) -> None:
    """Verify user has access to a task via list, project, or ownership."""
    if task.list_id:
        await _check_list_access(task.list_id, user_id, db)
    elif task.project_id:
        from app.api.routes.projects import _check_project_access
        await _check_project_access(task.project_id, user_id, db)
    elif task.created_by != user_id:
        raise HTTPException(status_code=403, detail="Non hai accesso a questo task")
