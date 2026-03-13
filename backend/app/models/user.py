from datetime import datetime, time, timezone

from sqlalchemy import String, Boolean, DateTime, BigInteger, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100))
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    api_key: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    jira_account_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Daily report preferences
    daily_report_email: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    daily_report_push: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    daily_report_time: Mapped[time | None] = mapped_column(Time, nullable=True, default=lambda: time(7, 0))
    daily_report_last_sent: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    owned_lists: Mapped[list["TaskList"]] = relationship(back_populates="owner")
    list_memberships: Mapped[list["ListMember"]] = relationship(back_populates="user")
    areas: Mapped[list["Area"]] = relationship(back_populates="owner")
