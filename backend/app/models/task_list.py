from datetime import datetime, timezone

from sqlalchemy import String, ForeignKey, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TaskList(Base):
    __tablename__ = "lists"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    color: Mapped[str] = mapped_column(String(7), default="#3B82F6")
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    owner: Mapped["User"] = relationship(back_populates="owned_lists")
    members: Mapped[list["ListMember"]] = relationship(back_populates="task_list")
    tasks: Mapped[list["Task"]] = relationship(back_populates="task_list")


class ListMember(Base):
    __tablename__ = "list_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    list_id: Mapped[int] = mapped_column(ForeignKey("lists.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20), default="edit")  # owner, edit, view

    task_list: Mapped["TaskList"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="list_memberships")
