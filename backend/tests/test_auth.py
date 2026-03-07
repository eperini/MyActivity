import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register(client: AsyncClient):
    res = await client.post("/api/auth/register", json={
        "email": "new@test.com",
        "password": "securepass1",
        "display_name": "New User",
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate(client: AsyncClient):
    payload = {"email": "dup@test.com", "password": "securepass1", "display_name": "Dup"}
    await client.post("/api/auth/register", json=payload)
    res = await client.post("/api/auth/register", json=payload)
    assert res.status_code == 400
    assert "gia registrata" in res.json()["detail"]


@pytest.mark.asyncio
async def test_register_short_password(client: AsyncClient):
    res = await client.post("/api/auth/register", json={
        "email": "short@test.com",
        "password": "123",
        "display_name": "Short",
    })
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_login(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "login@test.com",
        "password": "securepass1",
        "display_name": "Login User",
    })
    res = await client.post("/api/auth/login", json={
        "email": "login@test.com",
        "password": "securepass1",
    })
    assert res.status_code == 200
    assert "access_token" in res.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "wrong@test.com",
        "password": "securepass1",
        "display_name": "Wrong",
    })
    res = await client.post("/api/auth/login", json={
        "email": "wrong@test.com",
        "password": "wrongpassword",
    })
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent(client: AsyncClient):
    res = await client.post("/api/auth/login", json={
        "email": "ghost@test.com",
        "password": "whatever123",
    })
    assert res.status_code == 401
