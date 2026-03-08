from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import String, Text, ForeignKey, DateTime, SmallInteger, Enum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class WorkdayAdjust(str, PyEnum):
    NONE = "none"       # nessun aggiustamento
    NEXT = "next"       # prossimo giorno target (es. prossimo lunedi)
    PREV = "prev"       # giorno target precedente


class RecurrenceRule(Base):
    __tablename__ = "recurrence_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), unique=True)
    rrule: Mapped[str] = mapped_column(Text)  # RFC 5545 RRULE string
    workday_adjust: Mapped[WorkdayAdjust] = mapped_column(
        Enum(WorkdayAdjust), default=WorkdayAdjust.NONE
    )
    workday_target: Mapped[int | None] = mapped_column(
        SmallInteger, nullable=True
    )  # 0=lunedi, 6=domenica
    next_occurrence: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    task: Mapped["Task"] = relationship(back_populates="recurrence")


class TaskInstance(Base):
    __tablename__ = "task_instances"
    __table_args__ = (
        UniqueConstraint("task_id", "due_date", name="uq_task_instance_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="todo")  # todo, done, skip
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    task: Mapped["Task"] = relationship(back_populates="instances")
