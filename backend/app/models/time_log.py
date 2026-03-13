from datetime import datetime, date

from sqlalchemy import Integer, Text, Date, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TimeLog(Base):
    __tablename__ = "time_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    logged_at: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=func.current_date()
    )
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    task = relationship("Task", back_populates="time_logs")
    user = relationship("User")

    __table_args__ = (
        Index("idx_time_logs_task", "task_id"),
        Index("idx_time_logs_user", "user_id"),
        Index("idx_time_logs_date", "logged_at"),
        Index("idx_time_logs_user_date", "user_id", "logged_at"),
    )
