from datetime import date, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func, extract, and_, case, text
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

    # --- Task counts (single query with conditional aggregation) ---
    result = await db.execute(
        select(
            func.count(Task.id).label("total"),
            func.count(Task.id).filter(Task.status == TaskStatus.DONE).label("completed"),
            func.count(Task.id).filter(
                and_(Task.status != TaskStatus.DONE, Task.due_date < today)
            ).label("overdue"),
            func.count(Task.id).filter(
                and_(Task.status != TaskStatus.DONE, Task.due_date == today)
            ).label("due_today"),
        ).where(Task.created_by == user.id)
    )
    row = result.one()
    total_tasks = row.total or 0
    completed_tasks = row.completed or 0
    overdue_tasks = row.overdue or 0
    due_today = row.due_today or 0

    completion_rate = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0

    # --- Weekly breakdown (single query with GROUP BY) ---
    week_start = today - timedelta(days=6)

    completed_by_day = {}
    result = await db.execute(
        select(
            func.date(Task.completed_at).label("d"),
            func.count(Task.id),
        ).where(
            Task.created_by == user.id,
            Task.status == TaskStatus.DONE,
            func.date(Task.completed_at) >= week_start,
            func.date(Task.completed_at) <= today,
        ).group_by(text("d"))
    )
    for d, c in result.all():
        completed_by_day[d] = c

    created_by_day = {}
    result = await db.execute(
        select(
            func.date(Task.created_at).label("d"),
            func.count(Task.id),
        ).where(
            Task.created_by == user.id,
            func.date(Task.created_at) >= week_start,
            func.date(Task.created_at) <= today,
        ).group_by(text("d"))
    )
    for d, c in result.all():
        created_by_day[d] = c

    weekly = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        weekly.append(WeekDay(
            date=d.isoformat(),
            completed=completed_by_day.get(d, 0),
            created=created_by_day.get(d, 0),
        ))

    # Avg daily completed (last 30 days - single query)
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

    # --- Monthly trend (2 queries instead of 12) ---
    six_months_ago = (today.replace(day=1) - timedelta(days=150)).replace(day=1)

    monthly_completed = {}
    result = await db.execute(
        select(
            extract("year", Task.completed_at).label("y"),
            extract("month", Task.completed_at).label("m"),
            func.count(Task.id),
        ).where(
            Task.created_by == user.id,
            Task.status == TaskStatus.DONE,
            Task.completed_at >= six_months_ago,
        ).group_by(text("y"), text("m"))
    )
    for y, m, c in result.all():
        monthly_completed[(int(y), int(m))] = c

    monthly_created = {}
    result = await db.execute(
        select(
            extract("year", Task.created_at).label("y"),
            extract("month", Task.created_at).label("m"),
            func.count(Task.id),
        ).where(
            Task.created_by == user.id,
            Task.created_at >= six_months_ago,
        ).group_by(text("y"), text("m"))
    )
    for y, m, c in result.all():
        monthly_created[(int(y), int(m))] = c

    monthly = []
    current = today.replace(day=1)
    for i in range(5, -1, -1):
        # Walk back i months from current month
        m_date = today.replace(day=1)
        for _ in range(i):
            m_date = (m_date - timedelta(days=1)).replace(day=1)
        year, month = m_date.year, m_date.month
        monthly.append(MonthStat(
            month=f"{year}-{month:02d}",
            completed=monthly_completed.get((year, month), 0),
            created=monthly_created.get((year, month), 0),
        ))

    # --- Habits overview (2 queries instead of N*2) ---
    result = await db.execute(
        select(Habit).where(Habit.created_by == user.id, Habit.is_archived.is_(False))
    )
    habits = result.scalars().all()
    habits_overview = []

    if habits:
        habit_ids = [h.id for h in habits]

        # Monthly completions per habit (single query)
        result = await db.execute(
            select(HabitLog.habit_id, func.count(HabitLog.id)).where(
                HabitLog.habit_id.in_(habit_ids),
                extract("year", HabitLog.log_date) == today.year,
                extract("month", HabitLog.log_date) == today.month,
            ).group_by(HabitLog.habit_id)
        )
        month_counts = {hid: c for hid, c in result.all()}

        # All log dates for streak calculation (single query)
        result = await db.execute(
            select(HabitLog.habit_id, HabitLog.log_date).where(
                HabitLog.habit_id.in_(habit_ids),
            ).order_by(HabitLog.habit_id, HabitLog.log_date.desc())
        )
        logs_by_habit: dict[int, list[date]] = {}
        for hid, log_date in result.all():
            logs_by_habit.setdefault(hid, []).append(log_date)

        for h in habits:
            month_count = month_counts.get(h.id, 0)
            dates = logs_by_habit.get(h.id, [])
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

    # --- Pomodoro (unchanged, already 2 queries) ---
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

    # --- Priority breakdown (already 1 query) ---
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
