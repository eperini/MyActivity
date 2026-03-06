from datetime import datetime, date, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func, cast, Date, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.pomodoro import PomodoroSession

router = APIRouter()


class SessionCreate(BaseModel):
    task_id: int | None = None
    started_at: datetime
    ended_at: datetime
    duration_minutes: int
    session_type: str = "pomodoro"


class SessionResponse(BaseModel):
    id: int
    user_id: int
    task_id: int | None
    started_at: datetime
    ended_at: datetime
    duration_minutes: int
    session_type: str

    class Config:
        from_attributes = True


class PomodoroStats(BaseModel):
    today_pomos: int
    today_focus_minutes: int
    total_pomos: int
    total_focus_minutes: int


@router.post("/", response_model=SessionResponse)
async def create_session(
    data: SessionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = PomodoroSession(
        user_id=user.id,
        **data.model_dump(),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/", response_model=list[SessionResponse])
async def get_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PomodoroSession)
        .where(
            PomodoroSession.user_id == user.id,
            PomodoroSession.session_type == "pomodoro",
        )
        .order_by(PomodoroSession.started_at.desc())
        .limit(100)
    )
    return result.scalars().all()


@router.get("/stats", response_model=PomodoroStats)
async def get_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()

    # Today stats
    today_result = await db.execute(
        select(
            func.count(PomodoroSession.id),
            func.coalesce(func.sum(PomodoroSession.duration_minutes), 0),
        ).where(
            PomodoroSession.user_id == user.id,
            PomodoroSession.session_type == "pomodoro",
            cast(PomodoroSession.started_at, Date) == today,
        )
    )
    today_row = today_result.one()

    # Total stats
    total_result = await db.execute(
        select(
            func.count(PomodoroSession.id),
            func.coalesce(func.sum(PomodoroSession.duration_minutes), 0),
        ).where(
            PomodoroSession.user_id == user.id,
            PomodoroSession.session_type == "pomodoro",
        )
    )
    total_row = total_result.one()

    return PomodoroStats(
        today_pomos=today_row[0],
        today_focus_minutes=today_row[1],
        total_pomos=total_row[0],
        total_focus_minutes=total_row[1],
    )
