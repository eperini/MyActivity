from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.comment import Comment

router = APIRouter()


class CommentCreate(BaseModel):
    text: str


@router.get("/tasks/{task_id}/comments")
async def list_comments(task_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Comment, User.display_name)
        .join(User, Comment.user_id == User.id)
        .where(Comment.task_id == task_id)
        .order_by(Comment.created_at.asc())
    )
    return [
        {
            "id": c.id,
            "task_id": c.task_id,
            "user_id": c.user_id,
            "user_name": name,
            "text": c.text,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c, name in result.all()
    ]


@router.post("/tasks/{task_id}/comments")
async def add_comment(task_id: int, data: CommentCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    comment = Comment(task_id=task_id, user_id=user.id, text=data.text)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return {
        "id": comment.id,
        "task_id": comment.task_id,
        "user_id": comment.user_id,
        "user_name": user.display_name,
        "text": comment.text,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


@router.delete("/tasks/{task_id}/comments/{comment_id}")
async def delete_comment(task_id: int, comment_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    comment = await db.get(Comment, comment_id)
    if not comment or comment.task_id != task_id:
        raise HTTPException(404, "Commento non trovato")
    if comment.user_id != user.id:
        raise HTTPException(403, "Non puoi eliminare commenti altrui")
    await db.delete(comment)
    await db.commit()
    return {"detail": "Commento eliminato"}
