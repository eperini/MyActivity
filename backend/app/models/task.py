from datetime import datetime, date, time, timezone
from enum import Enum as PyEnum

from sqlalchemy import (
    String, Text, ForeignKey, DateTime, Date, Time,
    Integer, Enum, SmallInteger
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TaskStatus(str, PyEnum):
    TODO = "todo"
    DOING = "doing"
    DONE = "done"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    priority: Mapped[int] = mapped_column(SmallInteger, default=4)  # 1=urgente+importante, 4=bassa
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), default=TaskStatus.TODO, index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    due_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    heading_id: Mapped[int | None] = mapped_column(ForeignKey("project_headings.id", ondelete="SET NULL"), nullable=True, index=True)
    custom_fields: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    google_event_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    project: Mapped["Project | None"] = relationship(back_populates="tasks")
    heading: Mapped["ProjectHeading | None"] = relationship(back_populates="tasks")
    recurrence: Mapped["RecurrenceRule | None"] = relationship(back_populates="task", uselist=False)
    instances: Mapped[list["TaskInstance"]] = relationship(back_populates="task")
    reminders: Mapped[list["TaskReminder"]] = relationship(
        back_populates="task", foreign_keys="TaskReminder.task_id"
    )
    subtasks: Mapped[list["Task"]] = relationship(back_populates="parent")
    parent: Mapped["Task | None"] = relationship(back_populates="subtasks", remote_side="Task.id")
    tags: Mapped[list["Tag"]] = relationship(secondary="task_tags", back_populates="tasks")
    comments: Mapped[list["Comment"]] = relationship(back_populates="task")
    estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    jira_issue_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    jira_issue_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    jira_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    jira_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    time_logs: Mapped[list["TimeLog"]] = relationship(back_populates="task", cascade="all, delete-orphan")
