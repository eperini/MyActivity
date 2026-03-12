from enum import Enum as PyEnum
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, ForeignKey, DateTime, Enum, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TriggerType(str, PyEnum):
    STATUS_CHANGED = "status_changed"
    DUE_DATE_PASSED = "due_date_passed"
    TASK_CREATED = "task_created"
    ALL_SUBTASKS_DONE = "all_subtasks_done"
    ASSIGNED_TO_CHANGED = "assigned_to_changed"


class ActionType(str, PyEnum):
    CHANGE_STATUS = "change_status"
    ASSIGN_TO = "assign_to"
    CREATE_TASK = "create_task"
    SEND_NOTIFICATION = "send_notification"
    SET_FIELD = "set_field"


class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    trigger_type: Mapped[TriggerType] = mapped_column(Enum(TriggerType))
    trigger_config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    action_type: Mapped[ActionType] = mapped_column(Enum(ActionType))
    action_config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_triggered: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="automations")
