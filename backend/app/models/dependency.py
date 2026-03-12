from enum import Enum as PyEnum
from datetime import datetime, timezone

from sqlalchemy import String, Integer, ForeignKey, DateTime, Enum, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DependencyType(str, PyEnum):
    BLOCKS = "blocks"
    RELATES_TO = "relates_to"
    DUPLICATES = "duplicates"


class TaskDependency(Base):
    __tablename__ = "task_dependencies"
    __table_args__ = (
        UniqueConstraint("blocking_task_id", "blocked_task_id"),
        CheckConstraint("blocking_task_id != blocked_task_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    blocking_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    blocked_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    dependency_type: Mapped[DependencyType] = mapped_column(Enum(DependencyType), default=DependencyType.BLOCKS)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    blocking_task: Mapped["Task"] = relationship(foreign_keys=[blocking_task_id])
    blocked_task: Mapped["Task"] = relationship(foreign_keys=[blocked_task_id])
