from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.task_list import TaskList, ListMember
from app.models.task import Task

router = APIRouter()


class ListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    color: str = "#3B82F6"
    icon: str | None = None


class ListUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    color: str | None = None
    icon: str | None = None


class ListResponse(BaseModel):
    id: int
    name: str
    color: str
    icon: str | None
    owner_id: int

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


class UpdateMemberRole(BaseModel):
    role: str = Field(pattern=r"^(edit|view)$")


async def _check_list_owner(list_id: int, user_id: int, db: AsyncSession) -> TaskList:
    task_list = await db.get(TaskList, list_id)
    if not task_list:
        raise HTTPException(status_code=404, detail="Lista non trovata")
    if task_list.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Non sei il proprietario di questa lista")
    return task_list


async def _check_list_access(list_id: int, user_id: int, db: AsyncSession) -> TaskList:
    task_list = await db.get(TaskList, list_id)
    if not task_list:
        raise HTTPException(status_code=404, detail="Lista non trovata")
    if task_list.owner_id == user_id:
        return task_list
    member = await db.execute(
        select(ListMember).where(ListMember.list_id == list_id, ListMember.user_id == user_id)
    )
    if not member.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Non hai accesso a questa lista")
    return task_list


@router.get("/", response_model=list[ListResponse])
async def get_lists(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restituisce le liste dell'utente (proprie + condivise)."""
    result = await db.execute(select(TaskList).where(TaskList.owner_id == user.id))
    owned = result.scalars().all()

    result = await db.execute(
        select(TaskList)
        .join(ListMember)
        .where(ListMember.user_id == user.id)
    )
    shared = result.scalars().all()

    all_lists = {l.id: l for l in [*owned, *shared]}
    return list(all_lists.values())


@router.post("/", response_model=ListResponse)
async def create_list(
    data: ListCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task_list = TaskList(name=data.name, color=data.color, icon=data.icon, owner_id=user.id)
    db.add(task_list)
    await db.commit()
    await db.refresh(task_list)
    return task_list


@router.patch("/{list_id}", response_model=ListResponse)
async def update_list(
    list_id: int,
    data: ListUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task_list = await _check_list_owner(list_id, user.id, db)
    if data.name is not None:
        task_list.name = data.name
    if data.color is not None:
        task_list.color = data.color
    if data.icon is not None:
        task_list.icon = data.icon
    await db.commit()
    await db.refresh(task_list)
    return task_list


@router.delete("/{list_id}")
async def delete_list(
    list_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task_list = await _check_list_owner(list_id, user.id, db)
    result = await db.execute(select(Task).where(Task.list_id == list_id))
    for task in result.scalars().all():
        await db.delete(task)
    result = await db.execute(select(ListMember).where(ListMember.list_id == list_id))
    for member in result.scalars().all():
        await db.delete(member)
    await db.delete(task_list)
    await db.commit()
    return {"detail": "Lista eliminata"}


# ─── Members ──────────────────────────────────────────

@router.get("/{list_id}/members", response_model=list[MemberResponse])
async def get_members(
    list_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_list_access(list_id, user.id, db)
    task_list = await db.get(TaskList, list_id)

    # Owner
    owner = await db.get(User, task_list.owner_id)
    members_list = [
        MemberResponse(id=0, user_id=owner.id, email=owner.email, display_name=owner.display_name, role="owner")
    ]

    # Members
    result = await db.execute(
        select(ListMember, User).join(User, ListMember.user_id == User.id).where(ListMember.list_id == list_id)
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


@router.post("/{list_id}/members", response_model=MemberResponse)
async def add_member(
    list_id: int,
    data: AddMemberRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_list_owner(list_id, user.id, db)

    # Find user by email
    result = await db.execute(select(User).where(User.email == data.email))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if target_user.id == user.id:
        raise HTTPException(status_code=400, detail="Sei gia il proprietario")

    # Check not already member
    existing = await db.execute(
        select(ListMember).where(ListMember.list_id == list_id, ListMember.user_id == target_user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Utente gia membro")

    member = ListMember(list_id=list_id, user_id=target_user.id, role=data.role)
    db.add(member)
    await db.commit()
    await db.refresh(member)

    return MemberResponse(
        id=member.id, user_id=target_user.id,
        email=target_user.email, display_name=target_user.display_name,
        role=member.role,
    )


@router.patch("/{list_id}/members/{member_id}")
async def update_member_role(
    list_id: int,
    member_id: int,
    data: UpdateMemberRole,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_list_owner(list_id, user.id, db)
    member = await db.get(ListMember, member_id)
    if not member or member.list_id != list_id:
        raise HTTPException(status_code=404, detail="Membro non trovato")
    member.role = data.role
    await db.commit()
    return {"detail": "Ruolo aggiornato"}


@router.delete("/{list_id}/members/{member_id}")
async def remove_member(
    list_id: int,
    member_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task_list = await _check_list_access(list_id, user.id, db)
    member = await db.get(ListMember, member_id)
    if not member or member.list_id != list_id:
        raise HTTPException(status_code=404, detail="Membro non trovato")
    # Members can remove themselves, owners can remove anyone
    if member.user_id != user.id and task_list.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    await db.delete(member)
    await db.commit()
    return {"detail": "Membro rimosso"}
