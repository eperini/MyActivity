from datetime import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import hash_password, verify_password, create_access_token
from app.models.user import User

router = APIRouter()


from app.core.limiter import limiter


def _set_auth_cookie(response: Response, token: str):
    """Set HttpOnly auth cookie."""
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=not settings.FRONTEND_URL.startswith("http://localhost"),
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserProfileResponse(BaseModel):
    id: int
    email: str
    display_name: str
    is_admin: bool = False
    has_seen_tour: bool = False
    daily_report_email: bool
    daily_report_push: bool
    daily_report_time: str | None


class DailyReportPreferences(BaseModel):
    has_seen_tour: bool | None = None
    daily_report_email: bool | None = None
    daily_report_push: bool | None = None
    daily_report_time: str | None = None  # "HH:MM" format


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(request: Request, response: Response, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email gia registrata")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        display_name=data.display_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, response: Response, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenziali non valide")

    token = create_access_token(user.id)
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token)


@router.post("/logout")
async def logout(response: Response):
    """Clear the auth cookie."""
    response.delete_cookie(key="access_token", path="/")
    return {"detail": "Logout effettuato"}


@router.get("/me", response_model=UserProfileResponse)
async def get_profile(user: User = Depends(get_current_user)):
    return UserProfileResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_admin=user.is_admin,
        has_seen_tour=user.has_seen_tour,
        daily_report_email=user.daily_report_email,
        daily_report_push=user.daily_report_push,
        daily_report_time=user.daily_report_time.strftime("%H:%M") if user.daily_report_time else "07:00",
    )


@router.post("/me/api-key")
async def generate_api_key(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import secrets
    import hashlib
    key = secrets.token_hex(32)
    user.api_key = hashlib.sha256(key.encode()).hexdigest()
    await db.commit()
    return {"api_key": key}


@router.delete("/me/api-key")
async def revoke_api_key(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.api_key = None
    await db.commit()
    return {"detail": "API key revocata"}


@router.patch("/me/preferences")
async def update_preferences(
    data: DailyReportPreferences,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.has_seen_tour is not None:
        user.has_seen_tour = data.has_seen_tour
    if data.daily_report_email is not None:
        user.daily_report_email = data.daily_report_email
    if data.daily_report_push is not None:
        user.daily_report_push = data.daily_report_push
    if data.daily_report_time is not None:
        try:
            h, m = data.daily_report_time.split(":")
            user.daily_report_time = time(int(h), int(m))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Formato orario non valido (usa HH:MM)")

    await db.commit()
    return {"detail": "Preferenze aggiornate"}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/me/change-password")
async def change_password(
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change current user's password."""
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "Password attuale non corretta")
    user.password_hash = hash_password(data.new_password)
    await db.commit()
    return {"detail": "Password aggiornata"}


class IntegrationSettingsResponse(BaseModel):
    jira_base_url: str
    jira_email: str
    jira_api_token_set: bool
    tempo_api_token_set: bool


class IntegrationSettingsUpdate(BaseModel):
    jira_base_url: str | None = None
    jira_email: str | None = None
    jira_api_token: str | None = None
    tempo_api_token: str | None = None


@router.get("/admin/integrations", response_model=IntegrationSettingsResponse)
async def get_integration_settings(user: User = Depends(get_current_user)):
    """Get integration settings (admin only)."""
    if not user.is_admin:
        raise HTTPException(403, "Solo admin")
    return IntegrationSettingsResponse(
        jira_base_url=settings.JIRA_BASE_URL,
        jira_email=settings.JIRA_EMAIL,
        jira_api_token_set=bool(settings.JIRA_API_TOKEN),
        tempo_api_token_set=bool(settings.TEMPO_API_TOKEN),
    )


@router.patch("/admin/integrations")
async def update_integration_settings(
    data: IntegrationSettingsUpdate,
    user: User = Depends(get_current_user),
):
    """Update integration settings (admin only). Updates in-memory and .env file."""
    if not user.is_admin:
        raise HTTPException(403, "Solo admin")

    updates: dict[str, str] = {}
    if data.jira_base_url is not None:
        settings.JIRA_BASE_URL = data.jira_base_url
        updates["JIRA_BASE_URL"] = data.jira_base_url
    if data.jira_email is not None:
        settings.JIRA_EMAIL = data.jira_email
        updates["JIRA_EMAIL"] = data.jira_email
    if data.jira_api_token is not None:
        settings.JIRA_API_TOKEN = data.jira_api_token
        updates["JIRA_API_TOKEN"] = data.jira_api_token
    if data.tempo_api_token is not None:
        settings.TEMPO_API_TOKEN = data.tempo_api_token
        updates["TEMPO_API_TOKEN"] = data.tempo_api_token

    # Persist to .env file
    if updates:
        _update_env_file(updates)

    return {"detail": "Impostazioni aggiornate"}


def _update_env_file(updates: dict[str, str]):
    """Update or append key=value pairs in the .env file."""
    import pathlib
    env_path = pathlib.Path("/app/.env")
    if not env_path.exists():
        env_path = pathlib.Path(".env")
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text().splitlines()

    updated_keys: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in updates:
            new_lines.append(f"{key}={updates[key]}")
            updated_keys.add(key)
        else:
            new_lines.append(line)

    # Append keys not found in file
    for key, value in updates.items():
        if key not in updated_keys:
            new_lines.append(f"{key}={value}")

    env_path.write_text("\n".join(new_lines) + "\n")


@router.get("/users")
async def list_users(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all users (admin only) — used for Tempo user linking."""
    if not user.is_admin:
        raise HTTPException(403, "Solo admin")
    result = await db.execute(select(User).order_by(User.display_name))
    users = result.scalars().all()
    return [{"id": u.id, "email": u.email, "display_name": u.display_name, "is_admin": u.is_admin} for u in users]


class AdminUserUpdate(BaseModel):
    display_name: str | None = None
    email: str | None = None
    is_admin: bool | None = None
    password: str | None = Field(default=None, min_length=6)


@router.patch("/users/{user_id}")
async def admin_update_user(
    user_id: int,
    data: AdminUserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a user (admin only)."""
    if not user.is_admin:
        raise HTTPException(403, "Solo admin")
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Utente non trovato")
    if data.display_name is not None:
        target.display_name = data.display_name
    if data.email is not None:
        existing = await db.execute(select(User).where(User.email == data.email, User.id != user_id))
        if existing.scalar_one_or_none():
            raise HTTPException(400, "Email già in uso")
        target.email = data.email
    if data.is_admin is not None:
        if target.id == user.id and not data.is_admin:
            raise HTTPException(400, "Non puoi rimuovere i tuoi diritti admin")
        target.is_admin = data.is_admin
    if data.password is not None:
        target.password_hash = hash_password(data.password)
    await db.commit()
    return {"id": target.id, "email": target.email, "display_name": target.display_name, "is_admin": target.is_admin}


@router.delete("/users/{user_id}")
async def admin_delete_user(
    user_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user (admin only)."""
    if not user.is_admin:
        raise HTTPException(403, "Solo admin")
    if user_id == user.id:
        raise HTTPException(400, "Non puoi eliminare te stesso")
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Utente non trovato")
    try:
        await db.delete(target)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Impossibile eliminare: l'utente ha risorse associate. Riassegna o elimina prima le sue liste e progetti.",
        )
    return {"detail": "Utente eliminato"}
