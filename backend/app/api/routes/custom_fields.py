from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.custom_field import ProjectCustomField, FieldType
from app.api.routes.projects import _check_project_owner

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────

class CustomFieldCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    field_key: str = Field(min_length=1, max_length=50, pattern=r"^[a-z0-9_]+$")
    field_type: FieldType
    options: dict | list | None = None
    default_value: dict | str | None = None
    is_required: bool = False


class CustomFieldUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    field_type: FieldType | None = None
    options: dict | list | None = None
    default_value: dict | str | None = None
    is_required: bool | None = None


class CustomFieldResponse(BaseModel):
    id: int
    project_id: int
    name: str
    field_key: str
    field_type: FieldType
    options: dict | list | None
    default_value: dict | str | None
    is_required: bool
    position: int

    class Config:
        from_attributes = True


class ReorderRequest(BaseModel):
    field_ids: list[int]


# ─── Routes ──────────────────────────────────────────
# Static routes BEFORE parametric ones (/{field_id})

@router.get("/projects/{project_id}/fields/", response_model=list[CustomFieldResponse])
async def list_custom_fields(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)
    result = await db.execute(
        select(ProjectCustomField)
        .where(ProjectCustomField.project_id == project_id)
        .order_by(ProjectCustomField.position, ProjectCustomField.id)
    )
    return result.scalars().all()


@router.post("/projects/{project_id}/fields/", response_model=CustomFieldResponse, status_code=201)
async def create_custom_field(
    project_id: int,
    data: CustomFieldCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)

    # Validate options for select/multi_select fields
    if data.field_type in (FieldType.SELECT, FieldType.MULTI_SELECT):
        if not data.options or not isinstance(data.options, list) or len(data.options) == 0:
            raise HTTPException(
                status_code=400,
                detail="I campi select e multi_select richiedono una lista 'options' non vuota",
            )

    # Check unique field_key within project
    existing = await db.execute(
        select(ProjectCustomField).where(
            ProjectCustomField.project_id == project_id,
            ProjectCustomField.field_key == data.field_key,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="field_key già esistente in questo progetto")

    # Get next position
    max_pos_result = await db.execute(
        select(ProjectCustomField.position)
        .where(ProjectCustomField.project_id == project_id)
        .order_by(ProjectCustomField.position.desc())
        .limit(1)
    )
    max_pos = max_pos_result.scalar()
    next_pos = (max_pos + 1) if max_pos is not None else 0

    field = ProjectCustomField(
        project_id=project_id,
        name=data.name,
        field_key=data.field_key,
        field_type=data.field_type,
        options=data.options,
        default_value=data.default_value,
        is_required=data.is_required,
        position=next_pos,
    )
    db.add(field)
    await db.commit()
    await db.refresh(field)
    return field


@router.patch("/projects/{project_id}/fields/reorder")
async def reorder_custom_fields(
    project_id: int,
    data: ReorderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)

    result = await db.execute(
        select(ProjectCustomField).where(ProjectCustomField.project_id == project_id)
    )
    fields = {f.id: f for f in result.scalars().all()}

    for position, field_id in enumerate(data.field_ids):
        if field_id not in fields:
            raise HTTPException(status_code=400, detail=f"Campo {field_id} non trovato nel progetto")
        fields[field_id].position = position

    await db.commit()
    return {"detail": "Ordine aggiornato"}


@router.patch("/projects/{project_id}/fields/{field_id}", response_model=CustomFieldResponse)
async def update_custom_field(
    project_id: int,
    field_id: int,
    data: CustomFieldUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)

    field = await db.get(ProjectCustomField, field_id)
    if not field or field.project_id != project_id:
        raise HTTPException(status_code=404, detail="Campo non trovato")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(field, key, value)

    await db.commit()
    await db.refresh(field)
    return field


@router.delete("/projects/{project_id}/fields/{field_id}")
async def delete_custom_field(
    project_id: int,
    field_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)

    field = await db.get(ProjectCustomField, field_id)
    if not field or field.project_id != project_id:
        raise HTTPException(status_code=404, detail="Campo non trovato")

    await db.delete(field)
    await db.commit()
    return {"detail": "Campo eliminato"}
