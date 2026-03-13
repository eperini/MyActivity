from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import String, ForeignKey, DateTime, Integer, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class NotificationChannel(str, PyEnum):
    TELEGRAM = "telegram"
    EMAIL = "email"
    PUSH = "push"
    BOTH = "both"  # telegram + push


class TaskReminder(Base):
    """Task/habit reminder notifications (renamed from notifications to task_reminders)."""
    __tablename__ = "task_reminders"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    habit_id: Mapped[int | None] = mapped_column(
        ForeignKey("habits.id", ondelete="CASCADE"), nullable=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    channel: Mapped[NotificationChannel] = mapped_column(
        Enum(NotificationChannel, values_callable=lambda e: [x.value for x in e]),
        default=NotificationChannel.TELEGRAM,
    )
    offset_minutes: Mapped[int] = mapped_column(Integer, default=0)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    task: Mapped["Task | None"] = relationship(back_populates="reminders")
    habit: Mapped["Habit | None"] = relationship(back_populates="reminders")
