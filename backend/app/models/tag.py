from datetime import datetime, timezone

from sqlalchemy import String, ForeignKey, DateTime, Table, Column, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

task_tags = Table(
    "task_tags",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str] = mapped_column(String(7), default="#6B7280")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    tasks: Mapped[list["Task"]] = relationship(secondary=task_tags, back_populates="tags")

    __table_args__ = (
        UniqueConstraint("name", "user_id", name="uq_tag_name_user"),
    )
