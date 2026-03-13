from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.area import Area
from app.models.project import Project, ProjectMember
from app.models.sharing import (
    ProjectRole, InvitationStatus, NotificationType,
    UserProjectArea, ProjectInvitation, AppNotification,
)
from app.api.routes.projects import _check_project_access

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────

class InvitationCreate(BaseModel):
    email: EmailStr
    role: str = Field(default="user", pattern=r"^(admin|super_user|user)$")


class InvitationResponse(BaseModel):
    id: int
    project_id: int
    email: str
    role: str
    status: str
    expires_at: str
    invited_by_name: str = ""
    project_name: str = ""
    created_at: str


class AcceptInvitation(BaseModel):
    area_id: int | None = None
    new_area_name: str | None = Field(None, max_length=100)

    @model_validator(mode="after")
    def validate_area(self):
        if not self.area_id and not self.new_area_name:
            raise ValueError("Fornire area_id oppure new_area_name")
        if self.area_id and self.new_area_name:
            raise ValueError("Fornire area_id OPPURE new_area_name, non entrambi")
        return self


# ─── Project-scoped endpoints (admin only) ────────────

@router.get("/projects/{project_id}/invitations/", response_model=list[InvitationResponse])
async def get_project_invitations(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db, min_role=ProjectRole.ADMIN)
    result = await db.execute(
        select(ProjectInvitation).where(
            ProjectInvitation.project_id == project_id,
        ).order_by(ProjectInvitation.created_at.desc())
    )
    invitations = result.scalars().all()

    responses = []
    for inv in invitations:
        inviter = await db.get(User, inv.invited_by)
        responses.append(InvitationResponse(
            id=inv.id, project_id=inv.project_id, email=inv.email,
            role=inv.role, status=inv.status,
            expires_at=inv.expires_at.isoformat(),
            invited_by_name=inviter.display_name if inviter else "",
            created_at=inv.created_at.isoformat(),
        ))
    return responses


@router.post("/projects/{project_id}/invitations/", response_model=InvitationResponse)
async def send_invitation(
    project_id: int,
    body: InvitationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db, min_role=ProjectRole.ADMIN)

    # Check if user already a member
    result = await db.execute(select(User).where(User.email == body.email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        existing_member = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == existing_user.id,
            )
        )
        if existing_member.scalar_one_or_none():
            raise HTTPException(409, "Utente già membro del progetto")

    # Check for pending invitation to same email
    existing_inv = await db.execute(
        select(ProjectInvitation).where(
            ProjectInvitation.project_id == project_id,
            ProjectInvitation.email == body.email,
            ProjectInvitation.status == InvitationStatus.PENDING.value,
        )
    )
    if existing_inv.scalar_one_or_none():
        raise HTTPException(409, "Invito già inviato a questa email")

    invitation = ProjectInvitation(
        project_id=project_id,
        invited_by=user.id,
        invited_user_id=existing_user.id if existing_user else None,
        email=body.email,
        role=body.role,
        token=ProjectInvitation.generate_token(),
        expires_at=ProjectInvitation.default_expiry(),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    # Send Telegram notification if user exists and has telegram
    project = await db.get(Project, project_id)
    if existing_user and existing_user.telegram_chat_id:
        from app.services.telegram_service import send_message
        invite_url = f"/invitations/{invitation.token}"
        text = (
            f"📩 <b>Invito al progetto '{project.name}'</b>\n"
            f"{user.display_name} ti ha invitato come {body.role}.\n"
            f"Accetta dall'app Zeno."
        )
        await send_message(existing_user.telegram_chat_id, text)

        # Also create in-app notification
        notif = AppNotification(
            user_id=existing_user.id,
            type=NotificationType.PROJECT_INVITATION.value,
            title=f"Invito al progetto '{project.name}'",
            body=f"{user.display_name} ti ha invitato come {body.role}",
            project_id=project_id,
            sent_telegram=True,
        )
        db.add(notif)
        await db.commit()

    return InvitationResponse(
        id=invitation.id, project_id=invitation.project_id, email=invitation.email,
        role=invitation.role, status=invitation.status,
        expires_at=invitation.expires_at.isoformat(),
        invited_by_name=user.display_name,
        project_name=project.name if project else "",
        created_at=invitation.created_at.isoformat(),
    )


@router.delete("/projects/{project_id}/invitations/{invitation_id}")
async def cancel_invitation(
    project_id: int,
    invitation_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_project_access(project_id, user.id, db, min_role=ProjectRole.ADMIN)
    invitation = await db.get(ProjectInvitation, invitation_id)
    if not invitation or invitation.project_id != project_id:
        raise HTTPException(404, "Invito non trovato")
    if invitation.status != InvitationStatus.PENDING.value:
        raise HTTPException(400, "Invito non più pendente")
    invitation.status = InvitationStatus.CANCELLED.value
    await db.commit()
    return {"detail": "Invito cancellato"}


# ─── Token-based endpoints (public preview, auth for accept/decline) ──

@router.get("/invitations/{token}", response_model=InvitationResponse)
async def get_invitation_preview(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectInvitation).where(ProjectInvitation.token == token)
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(404, "Invito non trovato")

    project = await db.get(Project, invitation.project_id)
    inviter = await db.get(User, invitation.invited_by)

    return InvitationResponse(
        id=invitation.id, project_id=invitation.project_id, email=invitation.email,
        role=invitation.role, status=invitation.status,
        expires_at=invitation.expires_at.isoformat(),
        invited_by_name=inviter.display_name if inviter else "",
        project_name=project.name if project else "",
        created_at=invitation.created_at.isoformat(),
    )


@router.post("/invitations/{token}/accept")
async def accept_invitation(
    token: str,
    body: AcceptInvitation,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectInvitation).where(ProjectInvitation.token == token)
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(404, "Invito non trovato")
    if invitation.status != InvitationStatus.PENDING.value:
        raise HTTPException(400, f"Invito non più valido (stato: {invitation.status})")
    if invitation.expires_at < datetime.now(timezone.utc):
        invitation.status = InvitationStatus.EXPIRED.value
        await db.commit()
        raise HTTPException(400, "Invito scaduto")

    # Check not already a member
    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == invitation.project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Sei già membro di questo progetto")

    # Create area if needed
    if body.new_area_name:
        new_area = Area(name=body.new_area_name, owner_id=user.id)
        db.add(new_area)
        await db.flush()
        area_id = new_area.id
    else:
        area_id = body.area_id

    # Add as project member
    db.add(ProjectMember(
        project_id=invitation.project_id,
        user_id=user.id,
        role=invitation.role,
    ))

    # Create user-project-area mapping
    db.add(UserProjectArea(
        user_id=user.id,
        project_id=invitation.project_id,
        area_id=area_id,
    ))

    # Update invitation
    invitation.status = InvitationStatus.ACCEPTED.value
    invitation.responded_at = datetime.now(timezone.utc)

    await db.commit()

    # Notify the inviter
    project = await db.get(Project, invitation.project_id)
    notif = AppNotification(
        user_id=invitation.invited_by,
        type=NotificationType.PROJECT_INVITATION.value,
        title="Invito accettato",
        body=f"{user.display_name} ha accettato l'invito al progetto '{project.name}'",
        project_id=invitation.project_id,
    )
    db.add(notif)
    await db.commit()

    # Send Telegram to inviter
    inviter = await db.get(User, invitation.invited_by)
    if inviter and inviter.telegram_chat_id:
        from app.services.telegram_service import send_message
        await send_message(
            inviter.telegram_chat_id,
            f"✅ <b>Invito accettato</b>\n{user.display_name} ha accettato l'invito al progetto '{project.name}'"
        )

    return {"status": "accepted", "project_id": invitation.project_id}


@router.post("/invitations/{token}/decline")
async def decline_invitation(
    token: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectInvitation).where(ProjectInvitation.token == token)
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(404, "Invito non trovato")
    if invitation.status != InvitationStatus.PENDING.value:
        raise HTTPException(400, "Invito non più valido")

    invitation.status = InvitationStatus.DECLINED.value
    invitation.responded_at = datetime.now(timezone.utc)
    await db.commit()

    return {"status": "declined"}


# ─── User's pending invitations ──────────────────────

@router.get("/invitations/pending/me", response_model=list[InvitationResponse])
async def get_my_pending_invitations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectInvitation).where(
            ProjectInvitation.email == user.email,
            ProjectInvitation.status == InvitationStatus.PENDING.value,
        ).order_by(ProjectInvitation.created_at.desc())
    )
    invitations = result.scalars().all()

    responses = []
    for inv in invitations:
        project = await db.get(Project, inv.project_id)
        inviter = await db.get(User, inv.invited_by)
        responses.append(InvitationResponse(
            id=inv.id, project_id=inv.project_id, email=inv.email,
            role=inv.role, status=inv.status,
            expires_at=inv.expires_at.isoformat(),
            invited_by_name=inviter.display_name if inviter else "",
            project_name=project.name if project else "",
            created_at=inv.created_at.isoformat(),
        ))
    return responses
