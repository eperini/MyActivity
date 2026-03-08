from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "MyActivity"
    DATABASE_URL: str = "postgresql+asyncpg://myactivity:changeme@localhost:5432/myactivity"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "super-secret-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 giorni
    TELEGRAM_BOT_TOKEN: str = ""
    CORS_ORIGINS: str = "http://localhost:3000"
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_MAILTO: str = "mailto:admin@myactivity.local"
    GOOGLE_CREDENTIALS_FILE: str = "/app/google-credentials.json"
    GOOGLE_CALENDAR_ID: str = ""
    GOOGLE_SYNC_LIST_ID: int = 0
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@myactivity.local"
    GOOGLE_DRIVE_FOLDER_ID: str = ""
    GOOGLE_DRIVE_CLIENT_ID: str = ""
    GOOGLE_DRIVE_CLIENT_SECRET: str = ""
    GOOGLE_DRIVE_REFRESH_TOKEN: str = ""
    BACKUP_KEEP_COUNT: int = 7

    class Config:
        env_file = ".env"


settings = Settings()
