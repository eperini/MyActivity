from datetime import datetime, date, timezone
from enum import Enum as PyEnum

from sqlalchemy import String, Text, Integer, ForeignKey, DateTime, Date, Enum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ProjectType(str, PyEnum):
    TECHNICAL = "technical"
    ADMINISTRATIVE = "administrative"
    PERSONAL = "personal"


class ProjectStatus(str, PyEnum):
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    project_type: Mapped[ProjectType] = mapped_column(Enum(ProjectType), default=ProjectType.PERSONAL)
    status: Mapped[ProjectStatus] = mapped_column(Enum(ProjectStatus), default=ProjectStatus.ACTIVE, index=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    client_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    area: Mapped["Area"] = relationship(back_populates="projects")
    owner: Mapped["User"] = relationship()
    members: Mapped[list["ProjectMember"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    tasks: Mapped[list["Task"]] = relationship(back_populates="project")
    custom_fields_def: Mapped[list["ProjectCustomField"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    automations: Mapped[list["AutomationRule"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    sprints: Mapped[list["Sprint"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    epics: Mapped[list["Epic"]] = relationship(back_populates="project", cascade="all, delete-orphan", order_by="Epic.position")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(10), default="edit")

    project: Mapped["Project"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship()
