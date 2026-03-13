import enum
from datetime import datetime

from sqlalchemy import Integer, String, Text, Date, DateTime, Boolean, ForeignKey, Enum as SQLEnum, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ReportType(str, enum.Enum):
    person = "person"
    project = "project"
    client = "client"


class ReportFrequency(str, enum.Enum):
    weekly = "weekly"
    monthly = "monthly"


class ReportConfig(Base):
    __tablename__ = "report_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    report_type: Mapped[ReportType] = mapped_column(SQLEnum(ReportType, name="report_type", create_type=False), nullable=False)
    frequency: Mapped[ReportFrequency] = mapped_column(SQLEnum(ReportFrequency, name="report_frequency", create_type=False), nullable=False)
    target_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    target_project_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    target_client_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    send_email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_to: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", foreign_keys=[user_id])
    target_user = relationship("User", foreign_keys=[target_user_id])
    target_project = relationship("Project")
    history = relationship("ReportHistory", back_populates="config")

    __table_args__ = (
        Index("idx_report_configs_user", "user_id"),
        Index("idx_report_configs_active", "is_active", "frequency"),
    )


class ReportHistory(Base):
    __tablename__ = "report_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    config_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("report_configs.id", ondelete="SET NULL"), nullable=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    report_type: Mapped[ReportType] = mapped_column(SQLEnum(ReportType, name="report_type", create_type=False), nullable=False)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    period_from = mapped_column(Date, nullable=False)
    period_to = mapped_column(Date, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    excel_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_json = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ok", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    config = relationship("ReportConfig", back_populates="history")
    user = relationship("User")
