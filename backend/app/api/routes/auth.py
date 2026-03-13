from datetime import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
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
        secure=False,  # set True if using HTTPS
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
    daily_report_email: bool
    daily_report_push: bool
    daily_report_time: str | None


class DailyReportPreferences(BaseModel):
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
