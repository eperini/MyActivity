from datetime import datetime, timezone

from sqlalchemy import String, Text, ForeignKey, DateTime, SmallInteger, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(SmallInteger, default=4)
    subtask_titles: Mapped[list | None] = mapped_column(JSON, nullable=True)
    recurrence_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
