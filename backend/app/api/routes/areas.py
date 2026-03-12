from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.area import Area
from app.models.project import Project

router = APIRouter()


class AreaCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    icon: str | None = Field(default=None, max_length=50)


class AreaUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    icon: str | None = Field(default=None, max_length=50)


class AreaResponse(BaseModel):
    id: int
    name: str
    color: str | None
    icon: str | None
    position: int
    project_count: int = 0

    class Config:
        from_attributes = True


@router.get("/", response_model=list[AreaResponse])
async def get_areas(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Area).where(Area.owner_id == user.id).order_by(Area.position, Area.id)
    )
    areas = result.scalars().all()

    # Count projects per area
    if areas:
        count_result = await db.execute(
            select(Project.area_id, func.count().label("cnt"))
            .where(Project.area_id.in_([a.id for a in areas]))
            .group_by(Project.area_id)
        )
        counts = {row.area_id: row.cnt for row in count_result.all()}
    else:
        counts = {}

    return [
        AreaResponse(
            id=a.id, name=a.name, color=a.color, icon=a.icon,
            position=a.position, project_count=counts.get(a.id, 0),
        )
        for a in areas
    ]


@router.post("/", response_model=AreaResponse)
async def create_area(
    data: AreaCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    area = Area(name=data.name, color=data.color, icon=data.icon, owner_id=user.id)
    db.add(area)
    await db.commit()
    await db.refresh(area)
    return AreaResponse(
        id=area.id, name=area.name, color=area.color, icon=area.icon,
        position=area.position, project_count=0,
    )


@router.patch("/reorder")
async def reorder_areas(
    data: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="ids richiesti")
    for i, aid in enumerate(ids):
        area = await db.get(Area, aid)
        if area and area.owner_id == user.id:
            area.position = i + 1
    await db.commit()
    return {"detail": "Riordinato"}


@router.patch("/{area_id}", response_model=AreaResponse)
async def update_area(
    area_id: int,
    data: AreaUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    area = await db.get(Area, area_id)
    if not area or area.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Area non trovata")
    if data.name is not None:
        area.name = data.name
    if data.color is not None:
        area.color = data.color
    if data.icon is not None:
        area.icon = data.icon
    await db.commit()
    await db.refresh(area)

    count_result = await db.execute(
        select(func.count()).where(Project.area_id == area.id)
    )
    count = count_result.scalar() or 0

    return AreaResponse(
        id=area.id, name=area.name, color=area.color, icon=area.icon,
        position=area.position, project_count=count,
    )


@router.delete("/{area_id}")
async def delete_area(
    area_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    area = await db.get(Area, area_id)
    if not area or area.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Area non trovata")
    # Projects become orphan (area_id = NULL via ON DELETE SET NULL)
    await db.delete(area)
    await db.commit()
    return {"detail": "Area eliminata"}
