from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

import app.models  # noqa: F401 - register all models for SQLAlchemy relationships
from app.api.routes import auth, tasks, lists, habits, recurrences, telegram, pomodoro, push, export, stats, google_calendar, backup, tags, comments, quickadd, shortcut, templates
from app.core.config import settings
from app.core.limiter import limiter

if not settings.SECRET_KEY:
    raise RuntimeError("SECRET_KEY must be set in environment variables")

app = FastAPI(title=settings.APP_NAME, version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
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
app.include_router(push.router, prefix="/api/push", tags=["push"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(stats.router, prefix="/api/stats", tags=["statistiche"])
app.include_router(google_calendar.router, prefix="/api/google", tags=["google-calendar"])
app.include_router(backup.router, prefix="/api/backup", tags=["backup"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
app.include_router(comments.router, prefix="/api", tags=["commenti"])
app.include_router(quickadd.router, prefix="/api/tasks", tags=["quick-add"])
app.include_router(shortcut.router, prefix="/api/shortcut", tags=["shortcut"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
