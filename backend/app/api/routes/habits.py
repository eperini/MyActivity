from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_, extract, delete
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


class HabitUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    frequency_type: str | None = None
    frequency_days: list[int] | None = None
    times_per_period: int | None = None
    color: str | None = None
    is_archived: bool | None = None


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


class HabitLogResponse(BaseModel):
    id: int
    habit_id: int
    log_date: date
    value: float
    note: str | None

    class Config:
        from_attributes = True


class HabitStatsResponse(BaseModel):
    total_completions: int
    current_streak: int
    monthly_checkins: int
    monthly_rate: float


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


@router.patch("/{habit_id}", response_model=HabitResponse)
async def update_habit(
    habit_id: int,
    data: HabitUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    habit = await db.get(Habit, habit_id)
    if not habit or habit.created_by != user.id:
        raise HTTPException(status_code=404, detail="Abitudine non trovata")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(habit, field, value)
    await db.commit()
    await db.refresh(habit)
    return habit


@router.delete("/{habit_id}")
async def delete_habit(
    habit_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    habit = await db.get(Habit, habit_id)
    if not habit or habit.created_by != user.id:
        raise HTTPException(status_code=404, detail="Abitudine non trovata")
    await db.delete(habit)
    await db.commit()
    return {"detail": "Abitudine eliminata"}


@router.post("/{habit_id}/toggle")
async def toggle_habit_log(
    habit_id: int,
    data: HabitLogCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle: se esiste il log per quel giorno lo rimuove, altrimenti lo crea."""
    habit = await db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Abitudine non trovata")

    result = await db.execute(
        select(HabitLog).where(
            HabitLog.habit_id == habit_id,
            HabitLog.log_date == data.log_date,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        return {"checked": False}
    else:
        log = HabitLog(
            habit_id=habit_id,
            user_id=user.id,
            log_date=data.log_date,
            value=data.value,
            note=data.note,
        )
        db.add(log)
        await db.commit()
        return {"checked": True}


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


@router.get("/{habit_id}/logs", response_model=list[HabitLogResponse])
async def get_habit_logs(
    habit_id: int,
    year: int = Query(...),
    month: int = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restituisce i log di un'abitudine per un mese specifico."""
    result = await db.execute(
        select(HabitLog).where(
            HabitLog.habit_id == habit_id,
            extract("year", HabitLog.log_date) == year,
            extract("month", HabitLog.log_date) == month,
        ).order_by(HabitLog.log_date)
    )
    return result.scalars().all()


@router.get("/{habit_id}/stats", response_model=HabitStatsResponse)
async def habit_stats(
    habit_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Statistiche: totale completamenti, streak, check-in mensili e rate."""
    # Total
    result = await db.execute(
        select(func.count(HabitLog.id)).where(HabitLog.habit_id == habit_id)
    )
    total = result.scalar() or 0

    # Monthly check-ins (current month)
    today = date.today()
    result = await db.execute(
        select(func.count(HabitLog.id)).where(
            HabitLog.habit_id == habit_id,
            extract("year", HabitLog.log_date) == today.year,
            extract("month", HabitLog.log_date) == today.month,
        )
    )
    monthly = result.scalar() or 0

    # Monthly rate
    days_in_month = today.day
    monthly_rate = round((monthly / days_in_month) * 100, 1) if days_in_month > 0 else 0

    # Streak
    result = await db.execute(
        select(HabitLog.log_date)
        .where(HabitLog.habit_id == habit_id)
        .order_by(HabitLog.log_date.desc())
    )
    dates = [row[0] for row in result.all()]

    streak = 0
    if dates:
        expected = today
        for d in dates:
            if d == expected:
                streak += 1
                expected -= timedelta(days=1)
            elif d < expected:
                break

    return HabitStatsResponse(
        total_completions=total,
        current_streak=streak,
        monthly_checkins=monthly,
        monthly_rate=monthly_rate,
    )


@router.get("/logs/week")
async def get_week_logs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restituisce tutti i log della settimana corrente per tutte le abitudini."""
    today = date.today()
    # Monday of current week
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)

    # Get user's habit ids
    habits_result = await db.execute(
        select(Habit.id).where(Habit.created_by == user.id, Habit.is_archived == False)
    )
    habit_ids = [r[0] for r in habits_result.all()]
    if not habit_ids:
        return {}

    result = await db.execute(
        select(HabitLog.habit_id, HabitLog.log_date).where(
            HabitLog.habit_id.in_(habit_ids),
            HabitLog.log_date >= monday,
            HabitLog.log_date <= sunday,
        )
    )

    # {habit_id: [date_str, ...]}
    week_logs: dict[int, list[str]] = {}
    for habit_id, log_date in result.all():
        week_logs.setdefault(habit_id, []).append(log_date.isoformat())

    return week_logs
