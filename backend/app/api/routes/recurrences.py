from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.recurrence import RecurrenceRule, TaskInstance, WorkdayAdjust
from app.services.recurrence_service import (
    build_rrule_string, get_next_occurrence, get_occurrences,
)

router = APIRouter()


class RecurrenceCreate(BaseModel):
    """
    Crea una regola di ricorrenza per un task.

    Esempi:
    - Ogni giorno: frequency="daily"
    - Ogni 3 giorni: frequency="daily", interval=3
    - Ogni lunedi e giovedi: frequency="weekly", days_of_week=[0,3]
    - Il 15 di ogni mese: frequency="monthly", day_of_month=15
    - Primo lunedi del mese: frequency="monthly", nth_weekday=1, nth_weekday_day=0
    - 1 marzo ogni anno: frequency="yearly", month=3, day_of_month=1

    Per il workday adjustment (es. "primo lunedi dopo il 1 del mese"):
    - frequency="monthly", day_of_month=1, workday_adjust="next", workday_target=0
    """
    frequency: str  # daily, weekly, monthly, yearly
    interval: int = 1
    days_of_week: list[int] | None = None
    day_of_month: int | None = None
    month: int | None = None
    nth_weekday: int | None = None
    nth_weekday_day: int | None = None
    workday_adjust: str = "none"  # none, next, prev
    workday_target: int | None = None  # 0=lunedi, 6=domenica


class RecurrenceResponse(BaseModel):
    id: int
    task_id: int
    rrule: str
    workday_adjust: WorkdayAdjust
    workday_target: int | None
    next_occurrence: date | None

    class Config:
        from_attributes = True


class OccurrencePreview(BaseModel):
    dates: list[date]


class InstanceResponse(BaseModel):
    id: int
    task_id: int
    due_date: date
    status: str
    completed_at: date | None

    class Config:
        from_attributes = True


@router.post("/tasks/{task_id}/recurrence", response_model=RecurrenceResponse)
async def set_recurrence(
    task_id: int,
    data: RecurrenceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Imposta o aggiorna la ricorrenza di un task."""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")

    rrule_str = build_rrule_string(
        frequency=data.frequency,
        interval=data.interval,
        days_of_week=data.days_of_week,
        day_of_month=data.day_of_month,
        month=data.month,
        nth_weekday=data.nth_weekday,
        nth_weekday_day=data.nth_weekday_day,
    )

    # Calcola prossima occorrenza
    start = task.due_date or date.today()
    next_occ = get_next_occurrence(
        rrule_str, dtstart=start,
        workday_adjust=data.workday_adjust,
        workday_target=data.workday_target,
    )

    # Controlla se esiste gia una regola
    result = await db.execute(
        select(RecurrenceRule).where(RecurrenceRule.task_id == task_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.rrule = rrule_str
        existing.workday_adjust = WorkdayAdjust(data.workday_adjust)
        existing.workday_target = data.workday_target
        existing.next_occurrence = next_occ
        rule = existing
    else:
        rule = RecurrenceRule(
            task_id=task_id,
            rrule=rrule_str,
            workday_adjust=WorkdayAdjust(data.workday_adjust),
            workday_target=data.workday_target,
            next_occurrence=next_occ,
        )
        db.add(rule)

    await db.commit()
    await db.refresh(rule)
    return rule


@router.get("/tasks/{task_id}/recurrence", response_model=RecurrenceResponse)
async def get_recurrence(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecurrenceRule).where(RecurrenceRule.task_id == task_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Nessuna ricorrenza per questo task")
    return rule


@router.delete("/tasks/{task_id}/recurrence")
async def delete_recurrence(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecurrenceRule).where(RecurrenceRule.task_id == task_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Nessuna ricorrenza per questo task")
    await db.delete(rule)
    await db.commit()
    return {"detail": "Ricorrenza eliminata"}


@router.get("/tasks/{task_id}/recurrence/preview", response_model=OccurrencePreview)
async def preview_occurrences(
    task_id: int,
    count: int = 10,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Anteprima delle prossime N occorrenze di un task ricorrente."""
    result = await db.execute(
        select(RecurrenceRule).where(RecurrenceRule.task_id == task_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Nessuna ricorrenza per questo task")

    task = await db.get(Task, task_id)
    start = task.due_date or date.today()

    dates = get_occurrences(
        rrule_string=rule.rrule,
        dtstart=start,
        after=date.today(),
        count=count,
        workday_adjust=rule.workday_adjust.value,
        workday_target=rule.workday_target,
    )
    return OccurrencePreview(dates=dates)


@router.get("/tasks/{task_id}/instances", response_model=list[InstanceResponse])
async def get_instances(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restituisce le istanze generate di un task ricorrente."""
    result = await db.execute(
        select(TaskInstance)
        .where(TaskInstance.task_id == task_id)
        .order_by(TaskInstance.due_date)
    )
    return result.scalars().all()


@router.patch("/instances/{instance_id}")
async def complete_instance(
    instance_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Segna un'istanza come completata."""
    from datetime import datetime, timezone

    instance = await db.get(TaskInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Istanza non trovata")

    instance.status = "done"
    instance.completed_at = datetime.now(timezone.utc)
    instance.completed_by = user.id
    await db.commit()
    return {"detail": "Istanza completata"}
