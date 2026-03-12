from enum import Enum as PyEnum

from sqlalchemy import String, Integer, Boolean, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class FieldType(str, PyEnum):
    TEXT = "text"
    NUMBER = "number"
    DATE = "date"
    SELECT = "select"
    MULTI_SELECT = "multi_select"
    BOOLEAN = "boolean"
    URL = "url"


class ProjectCustomField(Base):
    __tablename__ = "project_custom_fields"
    __table_args__ = (UniqueConstraint("project_id", "field_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    field_key: Mapped[str] = mapped_column(String(50))
    field_type: Mapped[FieldType] = mapped_column(Enum(FieldType))
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    default_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)

    project: Mapped["Project"] = relationship(back_populates="custom_fields_def")
