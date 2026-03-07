import asyncio
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.main import app

# Disable rate limiting for tests
from app.core.limiter import limiter
limiter.enabled = False

# Use test database in the same PostgreSQL
TEST_DATABASE_URL = "postgresql+asyncpg://myactivity:ebfbff67abaf4de438faba1ec236ca92@localhost:5432/myactivity_test"
engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSession() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient):
    """Client with a registered user and auth token."""
    res = await client.post("/api/auth/register", json={
        "email": "test@test.com",
        "password": "testpass123",
        "display_name": "Test User",
    })
    assert res.status_code == 200, f"Registration failed: {res.text}"
    token = res.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    yield client
