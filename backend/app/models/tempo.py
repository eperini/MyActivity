from datetime import datetime

from sqlalchemy import Integer, String, Text, Date, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class TempoUser(Base):
    __tablename__ = "tempo_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tempo_account_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    zeno_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    zeno_user = relationship("User")
    time_logs = relationship("TimeLog", back_populates="tempo_user")


class TempoImportLog(Base):
    __tablename__ = "tempo_import_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    triggered_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    period_from = mapped_column(Date, nullable=False)
    period_to = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False)
    worklogs_found: Mapped[int] = mapped_column(Integer, default=0)
    worklogs_created: Mapped[int] = mapped_column(Integer, default=0)
    worklogs_updated: Mapped[int] = mapped_column(Integer, default=0)
    worklogs_skipped: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    triggered_by_user = relationship("User")
