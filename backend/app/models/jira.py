from datetime import datetime

from sqlalchemy import Integer, String, Text, Boolean, DateTime, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class JiraConfig(Base):
    __tablename__ = "jira_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    jira_project_key: Mapped[str] = mapped_column(String(50), nullable=False)
    zeno_project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_sync_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user = relationship("User")
    project = relationship("Project")

    __table_args__ = (
        UniqueConstraint("user_id", "jira_project_key", name="uq_jira_config_user_project_key"),
        UniqueConstraint("user_id", "zeno_project_id", name="uq_jira_config_user_zeno_project"),
        Index("idx_jira_config_user", "user_id"),
        Index("idx_jira_config_enabled", "sync_enabled"),
    )
