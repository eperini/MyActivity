from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

import app.models  # noqa: F401 - register all models for SQLAlchemy relationships
from app.api.routes import auth, tasks, lists, habits, recurrences, telegram, pomodoro
from app.core.config import settings
from app.core.limiter import limiter

app = FastAPI(title=settings.APP_NAME, version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(lists.router, prefix="/api/lists", tags=["liste"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["task"])
app.include_router(habits.router, prefix="/api/habits", tags=["abitudini"])
app.include_router(recurrences.router, prefix="/api", tags=["ricorrenze"])
app.include_router(telegram.router, prefix="/api/telegram", tags=["telegram"])
app.include_router(pomodoro.router, prefix="/api/pomodoro", tags=["pomodoro"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
