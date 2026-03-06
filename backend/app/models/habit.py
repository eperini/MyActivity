from datetime import datetime, date, time, timezone

from sqlalchemy import (
    String, Text, ForeignKey, DateTime, Date, Time,
    Integer, Boolean, SmallInteger, ARRAY
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Habit(Base):
    __tablename__ = "habits"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    list_id: Mapped[int | None] = mapped_column(
        ForeignKey("lists.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    frequency_type: Mapped[str] = mapped_column(String(20), default="daily")  # daily, weekly, custom
    frequency_days: Mapped[list[int]] = mapped_column(
        ARRAY(SmallInteger), default=list
    )  # [0,2,4] = lun,mer,ven
    times_per_period: Mapped[int] = mapped_column(Integer, default=1)
    time_of_day: Mapped[time | None] = mapped_column(Time, nullable=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    color: Mapped[str] = mapped_column(String(7), default="#10B981")
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    notifications: Mapped[list["Notification"]] = relationship(back_populates="habit")
    logs: Mapped[list["HabitLog"]] = relationship(back_populates="habit")


class HabitLog(Base):
    __tablename__ = "habit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    log_date: Mapped[date] = mapped_column(Date)
    value: Mapped[float] = mapped_column(default=1.0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    habit: Mapped["Habit"] = relationship(back_populates="logs")

    __table_args__ = (
        # un solo log per abitudine per giorno
        {"sqlite_autoincrement": True},
    )
