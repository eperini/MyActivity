from datetime import date, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func, extract, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.habit import Habit, HabitLog
from app.models.pomodoro import PomodoroSession

router = APIRouter()


class WeekDay(BaseModel):
    date: str
    completed: int
    created: int


class MonthStat(BaseModel):
    month: str  # "2026-01"
    completed: int
    created: int


class HabitOverview(BaseModel):
    id: int
    name: str
    color: str
    completions_this_month: int
    current_streak: int


class DashboardStats(BaseModel):
    # Task counts
    total_tasks: int
    completed_tasks: int
    overdue_tasks: int
    due_today: int
    # Productivity
    completion_rate: float
    avg_daily_completed: float
    # Weekly breakdown (last 7 days)
    weekly: list[WeekDay]
    # Monthly trend (last 6 months)
    monthly: list[MonthStat]
    # Top habits
    habits_overview: list[HabitOverview]
    # Pomodoro
    total_focus_hours: float
    focus_sessions_this_week: int
    # Priority breakdown
    by_priority: dict[str, int]


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()

    # --- Task counts ---
    result = await db.execute(
        select(func.count(Task.id)).where(Task.created_by == user.id)
    )
    total_tasks = result.scalar() or 0

    result = await db.execute(
        select(func.count(Task.id)).where(
            Task.created_by == user.id, Task.status == TaskStatus.DONE
        )
    )
    completed_tasks = result.scalar() or 0

    result = await db.execute(
        select(func.count(Task.id)).where(
            Task.created_by == user.id,
            Task.status != TaskStatus.DONE,
            Task.due_date < today,
        )
    )
    overdue_tasks = result.scalar() or 0

    result = await db.execute(
        select(func.count(Task.id)).where(
            Task.created_by == user.id,
            Task.status != TaskStatus.DONE,
            Task.due_date == today,
        )
    )
    due_today = result.scalar() or 0

    completion_rate = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0

    # --- Weekly breakdown (last 7 days) ---
    week_start = today - timedelta(days=6)
    weekly = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        result = await db.execute(
            select(func.count(Task.id)).where(
                Task.created_by == user.id,
                Task.status == TaskStatus.DONE,
                func.date(Task.completed_at) == d,
            )
        )
        completed = result.scalar() or 0
        result = await db.execute(
            select(func.count(Task.id)).where(
                Task.created_by == user.id,
                func.date(Task.created_at) == d,
            )
        )
        created = result.scalar() or 0
        weekly.append(WeekDay(date=d.isoformat(), completed=completed, created=created))

    # Avg daily completed (last 30 days)
    thirty_days_ago = today - timedelta(days=30)
    result = await db.execute(
        select(func.count(Task.id)).where(
            Task.created_by == user.id,
            Task.status == TaskStatus.DONE,
            Task.completed_at >= thirty_days_ago,
        )
    )
    completed_30d = result.scalar() or 0
    avg_daily = round(completed_30d / 30, 1)

    # --- Monthly trend (last 6 months) ---
    monthly = []
    for i in range(5, -1, -1):
        m_date = today.replace(day=1) - timedelta(days=i * 30)
        year, month = m_date.year, m_date.month
        result = await db.execute(
            select(func.count(Task.id)).where(
                Task.created_by == user.id,
                Task.status == TaskStatus.DONE,
                extract("year", Task.completed_at) == year,
                extract("month", Task.completed_at) == month,
            )
        )
        m_completed = result.scalar() or 0
        result = await db.execute(
            select(func.count(Task.id)).where(
                Task.created_by == user.id,
                extract("year", Task.created_at) == year,
                extract("month", Task.created_at) == month,
            )
        )
        m_created = result.scalar() or 0
        monthly.append(MonthStat(
            month=f"{year}-{month:02d}",
            completed=m_completed,
            created=m_created,
        ))

    # --- Habits overview ---
    result = await db.execute(
        select(Habit).where(Habit.created_by == user.id, Habit.is_archived == False)
    )
    habits = result.scalars().all()
    habits_overview = []
    for h in habits:
        # This month completions
        result = await db.execute(
            select(func.count(HabitLog.id)).where(
                HabitLog.habit_id == h.id,
                extract("year", HabitLog.log_date) == today.year,
                extract("month", HabitLog.log_date) == today.month,
            )
        )
        month_count = result.scalar() or 0

        # Streak
        result = await db.execute(
            select(HabitLog.log_date)
            .where(HabitLog.habit_id == h.id)
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

        habits_overview.append(HabitOverview(
            id=h.id, name=h.name, color=h.color,
            completions_this_month=month_count,
            current_streak=streak,
        ))

    # --- Pomodoro ---
    week_start_dt = today - timedelta(days=today.weekday())
    result = await db.execute(
        select(func.sum(PomodoroSession.duration_minutes)).where(
            PomodoroSession.user_id == user.id
        )
    )
    total_focus_min = result.scalar() or 0
    total_focus_hours = round(total_focus_min / 60, 1)

    result = await db.execute(
        select(func.count(PomodoroSession.id)).where(
            PomodoroSession.user_id == user.id,
            func.date(PomodoroSession.started_at) >= week_start_dt,
        )
    )
    focus_sessions_week = result.scalar() or 0

    # --- Priority breakdown ---
    result = await db.execute(
        select(Task.priority, func.count(Task.id)).where(
            Task.created_by == user.id, Task.status != TaskStatus.DONE
        ).group_by(Task.priority)
    )
    priority_labels = {1: "urgente", 2: "alta", 3: "media", 4: "bassa"}
    by_priority = {v: 0 for v in priority_labels.values()}
    for prio, count in result.all():
        by_priority[priority_labels.get(prio, "bassa")] = count

    return DashboardStats(
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        overdue_tasks=overdue_tasks,
        due_today=due_today,
        completion_rate=completion_rate,
        avg_daily_completed=avg_daily,
        weekly=weekly,
        monthly=monthly,
        habits_overview=habits_overview,
        total_focus_hours=total_focus_hours,
        focus_sessions_this_week=focus_sessions_week,
        by_priority=by_priority,
    )
