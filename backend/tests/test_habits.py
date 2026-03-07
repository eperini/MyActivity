import pytest
from httpx import AsyncClient

HABIT_DATA = {"name": "Exercise", "frequency_type": "daily", "color": "#10B981", "start_date": "2026-03-01"}


@pytest.mark.asyncio
async def test_create_habit(auth_client: AsyncClient):
    res = await auth_client.post("/api/habits/", json=HABIT_DATA)
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Exercise"
    assert data["color"] == "#10B981"


@pytest.mark.asyncio
async def test_get_habits(auth_client: AsyncClient):
    await auth_client.post("/api/habits/", json={**HABIT_DATA, "name": "Read"})
    await auth_client.post("/api/habits/", json={**HABIT_DATA, "name": "Meditate"})
    res = await auth_client.get("/api/habits/")
    assert res.status_code == 200
    assert len(res.json()) >= 2


@pytest.mark.asyncio
async def test_toggle_habit(auth_client: AsyncClient):
    create = await auth_client.post("/api/habits/", json={**HABIT_DATA, "name": "Toggle"})
    habit_id = create.json()["id"]

    # Toggle on
    res = await auth_client.post(f"/api/habits/{habit_id}/toggle", json={"log_date": "2026-03-07"})
    assert res.status_code == 200
    assert res.json()["checked"] is True

    # Toggle off
    res = await auth_client.post(f"/api/habits/{habit_id}/toggle", json={"log_date": "2026-03-07"})
    assert res.status_code == 200
    assert res.json()["checked"] is False


@pytest.mark.asyncio
async def test_habit_stats(auth_client: AsyncClient):
    create = await auth_client.post("/api/habits/", json={**HABIT_DATA, "name": "Stats"})
    habit_id = create.json()["id"]
    await auth_client.post(f"/api/habits/{habit_id}/toggle", json={"log_date": "2026-03-05"})
    await auth_client.post(f"/api/habits/{habit_id}/toggle", json={"log_date": "2026-03-06"})
    await auth_client.post(f"/api/habits/{habit_id}/toggle", json={"log_date": "2026-03-07"})

    res = await auth_client.get(f"/api/habits/{habit_id}/stats")
    assert res.status_code == 200
    data = res.json()
    assert data["total_completions"] == 3
    assert data["current_streak"] >= 1


@pytest.mark.asyncio
async def test_delete_habit(auth_client: AsyncClient):
    create = await auth_client.post("/api/habits/", json={**HABIT_DATA, "name": "Delete Me"})
    habit_id = create.json()["id"]
    res = await auth_client.delete(f"/api/habits/{habit_id}")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_habit_idor(client: AsyncClient):
    """User cannot toggle another user's habit."""
    r1 = await client.post("/api/auth/register", json={
        "email": "h1@test.com", "password": "securepass1", "display_name": "H1"
    })
    t1 = r1.json()["access_token"]
    h1 = {"Authorization": f"Bearer {t1}"}
    create = await client.post("/api/habits/", json={**HABIT_DATA, "name": "Private"}, headers=h1)
    habit_id = create.json()["id"]

    r2 = await client.post("/api/auth/register", json={
        "email": "h2@test.com", "password": "securepass1", "display_name": "H2"
    })
    t2 = r2.json()["access_token"]
    h2 = {"Authorization": f"Bearer {t2}"}

    res = await client.post(f"/api/habits/{habit_id}/toggle", json={"log_date": "2026-03-07"}, headers=h2)
    assert res.status_code in (403, 404)
