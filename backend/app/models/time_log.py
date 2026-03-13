from datetime import datetime, date

from sqlalchemy import Integer, String, Text, Date, DateTime, Boolean, ForeignKey, Index, event, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TimeLog(Base):
    __tablename__ = "time_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    logged_at: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=func.current_date()
    )
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
    tempo_worklog_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tempo_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tempo_users.id", ondelete="SET NULL"), nullable=True
    )
    tempo_push_status: Mapped[str | None] = mapped_column(
        String(20), default="pending", nullable=True
    )
    tempo_push_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    tempo_pushed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    task = relationship("Task", back_populates="time_logs")
    user = relationship("User")
    tempo_user = relationship("TempoUser", back_populates="time_logs")

    __table_args__ = (
        Index("idx_time_logs_task", "task_id"),
        Index("idx_time_logs_user", "user_id"),
        Index("idx_time_logs_date", "logged_at"),
        Index("idx_time_logs_user_date", "user_id", "logged_at"),
    )


class TimeLogDeleted(Base):
    __tablename__ = "time_logs_deleted"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    original_log_id: Mapped[int] = mapped_column(Integer, nullable=False)
    tempo_worklog_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deleted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    synced_to_tempo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sync_attempted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


@event.listens_for(TimeLog, "before_delete")
def capture_deleted_log(mapper, connection, target):
    """Save tempo_worklog_id to tombstone table before deleting a pushed log."""
    if target.tempo_worklog_id and target.tempo_push_status == "pushed":
        connection.execute(
            TimeLogDeleted.__table__.insert().values(
                original_log_id=target.id,
                tempo_worklog_id=target.tempo_worklog_id,
                synced_to_tempo=False,
            )
        )
