from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.project import Project, ProjectMember, ProjectType, ProjectStatus
from app.models.custom_field import ProjectCustomField, FieldType

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    area_id: int | None = None
    project_type: ProjectType = ProjectType.PERSONAL
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    icon: str | None = Field(default=None, max_length=50)
    start_date: date | None = None
    target_date: date | None = None
    client_name: str | None = Field(default=None, max_length=200)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    area_id: int | None = None
    project_type: ProjectType | None = None
    status: ProjectStatus | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    icon: str | None = Field(default=None, max_length=50)
    start_date: date | None = None
    target_date: date | None = None
    client_name: str | None = Field(default=None, max_length=200)


class ProjectResponse(BaseModel):
    id: int
    area_id: int | None
    name: str
    description: str | None
    project_type: ProjectType
    status: ProjectStatus
    color: str | None
    icon: str | None
    owner_id: int
    start_date: date | None
    target_date: date | None
    client_name: str | None
    position: int
    task_count: int = 0
    completed_count: int = 0

    class Config:
        from_attributes = True


class MemberResponse(BaseModel):
    id: int
    user_id: int
    email: str
    display_name: str
    role: str


class AddMemberRequest(BaseModel):
    email: EmailStr
    role: str = Field(default="edit", pattern=r"^(edit|view)$")


class ProjectStatsResponse(BaseModel):
    total_tasks: int
    completed_tasks: int
    completion_pct: float
    overdue_tasks: int
    by_priority: dict[str, int]


DEFAULT_FIELDS: dict[ProjectType, list[dict]] = {
    ProjectType.TECHNICAL: [
        {"name": "Tipo", "field_key": "tipo", "field_type": FieldType.SELECT, "options": ["Bug", "Feature", "Test", "Deploy", "R&D"]},
        {"name": "Ambiente", "field_key": "ambiente", "field_type": FieldType.SELECT, "options": ["Dev", "Staging", "Produzione"]},
        {"name": "Ore stimate", "field_key": "ore_stimate", "field_type": FieldType.NUMBER},
        {"name": "Versione", "field_key": "versione", "field_type": FieldType.TEXT},
    ],
    ProjectType.ADMINISTRATIVE: [
        {"name": "Tipo documento", "field_key": "tipo_documento", "field_type": FieldType.SELECT, "options": ["Fattura", "Verbale", "Contratto", "Scadenza", "Altro"]},
        {"name": "Stato", "field_key": "stato_doc", "field_type": FieldType.SELECT, "options": ["Bozza", "In approvazione", "Approvato", "Archiviato"]},
        {"name": "Riferimento", "field_key": "riferimento", "field_type": FieldType.TEXT},
    ],
    ProjectType.PERSONAL: [],
}


async def _check_project_access(project_id: int, user_id: int, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Progetto non trovato")
    if project.owner_id == user_id:
        return project
    member = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if not member.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Non hai accesso a questo progetto")
    return project


async def _check_project_owner(project_id: int, user_id: int, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Progetto non trovato")
    if project.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Non sei il proprietario di questo progetto")
    return project


@router.get("/", response_model=list[ProjectResponse])
async def get_projects(
    area_id: int | None = Query(None),
    status: ProjectStatus | None = Query(None),
    project_type: ProjectType | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Projects owned by user + projects where user is member
    owned_ids = select(Project.id).where(Project.owner_id == user.id)
    member_ids = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)

    query = select(Project).where(Project.id.in_(owned_ids.union(member_ids)))
    if area_id is not None:
        query = query.where(Project.area_id == area_id)
    if status:
        query = query.where(Project.status == status)
    if project_type:
        query = query.where(Project.project_type == project_type)
    query = query.order_by(Project.position, Project.id)

    result = await db.execute(query)
    projects = result.scalars().all()

    # Task counts
    if projects:
        count_result = await db.execute(
            select(
                Task.project_id,
                func.count().label("total"),
                func.count(case((Task.status == TaskStatus.DONE, 1))).label("done"),
            )
            .where(Task.project_id.in_([p.id for p in projects]), Task.parent_id.is_(None))
            .group_by(Task.project_id)
        )
        counts = {row.project_id: (row.total, row.done) for row in count_result.all()}
    else:
        counts = {}

    return [
        ProjectResponse(
            id=p.id, area_id=p.area_id, name=p.name, description=p.description,
            project_type=p.project_type, status=p.status, color=p.color, icon=p.icon,
            owner_id=p.owner_id, start_date=p.start_date, target_date=p.target_date,
            client_name=p.client_name, position=p.position,
            task_count=counts.get(p.id, (0, 0))[0],
            completed_count=counts.get(p.id, (0, 0))[1],
        )
        for p in projects
    ]


@router.post("/", response_model=ProjectResponse)
async def create_project(
    data: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(
        name=data.name,
        description=data.description,
        area_id=data.area_id,
        project_type=data.project_type,
        color=data.color,
        icon=data.icon,
        owner_id=user.id,
        start_date=data.start_date,
        target_date=data.target_date,
        client_name=data.client_name,
    )
    db.add(project)
    await db.flush()

    # Auto-create default custom fields based on project_type
    for position, field_def in enumerate(DEFAULT_FIELDS.get(data.project_type, [])):
        cf = ProjectCustomField(
            project_id=project.id,
            name=field_def["name"],
            field_key=field_def["field_key"],
            field_type=field_def["field_type"],
            options=field_def.get("options"),
            position=position,
        )
        db.add(cf)

    await db.commit()
    await db.refresh(project)
    return ProjectResponse(
        id=project.id, area_id=project.area_id, name=project.name,
        description=project.description, project_type=project.project_type,
        status=project.status, color=project.color, icon=project.icon,
        owner_id=project.owner_id, start_date=project.start_date,
        target_date=project.target_date, client_name=project.client_name,
        position=project.position, task_count=0, completed_count=0,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _check_project_access(project_id, user.id, db)
    count_result = await db.execute(
        select(
            func.count().label("total"),
            func.count(case((Task.status == TaskStatus.DONE, 1))).label("done"),
        ).where(Task.project_id == project.id, Task.parent_id.is_(None))
    )
    row = count_result.one()
    return ProjectResponse(
        id=project.id, area_id=project.area_id, name=project.name,
        description=project.description, project_type=project.project_type,
        status=project.status, color=project.color, icon=project.icon,
        owner_id=project.owner_id, start_date=project.start_date,
        target_date=project.target_date, client_name=project.client_name,
        position=project.position, task_count=row.total, completed_count=row.done,
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _check_project_owner(project_id, user.id, db)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)

    count_result = await db.execute(
        select(
            func.count().label("total"),
            func.count(case((Task.status == TaskStatus.DONE, 1))).label("done"),
        ).where(Task.project_id == project.id, Task.parent_id.is_(None))
    )
    row = count_result.one()
    return ProjectResponse(
        id=project.id, area_id=project.area_id, name=project.name,
        description=project.description, project_type=project.project_type,
        status=project.status, color=project.color, icon=project.icon,
        owner_id=project.owner_id, start_date=project.start_date,
        target_date=project.target_date, client_name=project.client_name,
        position=project.position, task_count=row.total, completed_count=row.done,
    )


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _check_project_owner(project_id, user.id, db)
    # Unlink tasks (project_id → NULL via ON DELETE SET NULL)
    await db.delete(project)
    await db.commit()
    return {"detail": "Progetto eliminato"}


@router.get("/{project_id}/stats", response_model=ProjectStatsResponse)
async def get_project_stats(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)

    result = await db.execute(
        select(
            func.count().label("total"),
            func.count(case((Task.status == TaskStatus.DONE, 1))).label("done"),
            func.count(case((
                (Task.due_date < func.current_date()) & (Task.status != TaskStatus.DONE), 1
            ))).label("overdue"),
        ).where(Task.project_id == project_id, Task.parent_id.is_(None))
    )
    row = result.one()

    priority_result = await db.execute(
        select(Task.priority, func.count())
        .where(Task.project_id == project_id, Task.parent_id.is_(None))
        .group_by(Task.priority)
    )
    by_priority = {str(r[0]): r[1] for r in priority_result.all()}

    return ProjectStatsResponse(
        total_tasks=row.total,
        completed_tasks=row.done,
        completion_pct=round(row.done / row.total * 100, 1) if row.total > 0 else 0,
        overdue_tasks=row.overdue,
        by_priority=by_priority,
    )


# ─── Members ──────────────────────────────────────────

@router.get("/{project_id}/members", response_model=list[MemberResponse])
async def get_project_members(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db)
    project = await db.get(Project, project_id)

    owner = await db.get(User, project.owner_id)
    members_list = [
        MemberResponse(id=0, user_id=owner.id, email=owner.email, display_name=owner.display_name, role="owner")
    ]

    result = await db.execute(
        select(ProjectMember, User)
        .join(User, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project_id)
    )
    for member, member_user in result.all():
        members_list.append(
            MemberResponse(
                id=member.id, user_id=member_user.id,
                email=member_user.email, display_name=member_user.display_name,
                role=member.role,
            )
        )
    return members_list


@router.post("/{project_id}/members", response_model=MemberResponse)
async def add_project_member(
    project_id: int,
    data: AddMemberRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_owner(project_id, user.id, db)

    result = await db.execute(select(User).where(User.email == data.email))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if target_user.id == user.id:
        raise HTTPException(status_code=400, detail="Sei già il proprietario")

    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == target_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Utente già membro")

    member = ProjectMember(project_id=project_id, user_id=target_user.id, role=data.role)
    db.add(member)
    await db.commit()
    await db.refresh(member)

    return MemberResponse(
        id=member.id, user_id=target_user.id,
        email=target_user.email, display_name=target_user.display_name,
        role=member.role,
    )


@router.delete("/{project_id}/members/{member_id}")
async def remove_project_member(
    project_id: int,
    member_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _check_project_access(project_id, user.id, db)
    member = await db.get(ProjectMember, member_id)
    if not member or member.project_id != project_id:
        raise HTTPException(status_code=404, detail="Membro non trovato")
    if member.user_id != user.id and project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    await db.delete(member)
    await db.commit()
    return {"detail": "Membro rimosso"}
