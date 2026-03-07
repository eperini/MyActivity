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

    class Config:
        env_file = ".env"


settings = Settings()
