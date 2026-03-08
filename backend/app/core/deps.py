from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token non valido")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utente non trovato")
    return user


async def get_user_by_api_key(
    x_api_key: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(select(User).where(User.api_key == x_api_key))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key non valida")
    return user
