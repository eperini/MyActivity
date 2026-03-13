import enum
from datetime import datetime, date

from sqlalchemy import Integer, String, Text, Date, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EpicStatus(str, enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class Epic(Base):
    __tablename__ = "epics"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="todo")
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    jira_issue_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    jira_issue_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    jira_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    jira_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project = relationship("Project", back_populates="epics")
    creator = relationship("User")
    time_logs = relationship("TimeLog", back_populates="epic", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_epics_project", "project_id"),
        Index("idx_epics_status", "project_id", "status"),
    )
