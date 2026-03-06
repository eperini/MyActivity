from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.habit import Habit, HabitLog

router = APIRouter()


class HabitCreate(BaseModel):
    name: str
    description: str | None = None
    frequency_type: str = "daily"
    frequency_days: list[int] = []
    times_per_period: int = 1
    start_date: date
    color: str = "#10B981"


class HabitResponse(BaseModel):
    id: int
    name: str
    description: str | None
    frequency_type: str
    frequency_days: list[int]
    times_per_period: int
    start_date: date
    color: str
    is_archived: bool

    class Config:
        from_attributes = True


class HabitLogCreate(BaseModel):
    log_date: date
    value: float = 1.0
    note: str | None = None


@router.get("/", response_model=list[HabitResponse])
async def get_habits(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Habit)
        .where(Habit.created_by == user.id, Habit.is_archived == False)
        .order_by(Habit.position)
    )
    return result.scalars().all()


@router.post("/", response_model=HabitResponse)
async def create_habit(
    data: HabitCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    habit = Habit(**data.model_dump(), created_by=user.id)
    db.add(habit)
    await db.commit()
    await db.refresh(habit)
    return habit


@router.post("/{habit_id}/log")
async def log_habit(
    habit_id: int,
    data: HabitLogCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    habit = await db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Abitudine non trovata")

    log = HabitLog(
        habit_id=habit_id,
        user_id=user.id,
        log_date=data.log_date,
        value=data.value,
        note=data.note,
    )
    db.add(log)
    await db.commit()
    return {"detail": "Log registrato"}


@router.get("/{habit_id}/stats")
async def habit_stats(
    habit_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Statistiche base: totale completamenti e streak corrente."""
    result = await db.execute(
        select(func.count(HabitLog.id))
        .where(HabitLog.habit_id == habit_id)
    )
    total = result.scalar()

    # Streak: giorni consecutivi con log (calcolo semplificato)
    result = await db.execute(
        select(HabitLog.log_date)
        .where(HabitLog.habit_id == habit_id)
        .order_by(HabitLog.log_date.desc())
    )
    dates = [row[0] for row in result.all()]

    streak = 0
    if dates:
        from datetime import timedelta
        expected = date.today()
        for d in dates:
            if d == expected:
                streak += 1
                expected -= timedelta(days=1)
            elif d < expected:
                break

    return {"total_completions": total, "current_streak": streak}
