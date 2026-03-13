import pytest
from httpx import AsyncClient

from tests.conftest import register_user, create_area


@pytest.mark.asyncio
async def test_create_area(auth_client: AsyncClient):
    res = await auth_client.post("/api/areas/", json={
        "name": "Work",
        "color": "#3B82F6",
        "icon": "briefcase",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Work"
    assert data["color"] == "#3B82F6"
    assert data["icon"] == "briefcase"
    assert data["project_count"] == 0


@pytest.mark.asyncio
async def test_create_area_validation(auth_client: AsyncClient):
    # Empty name
    res = await auth_client.post("/api/areas/", json={"name": ""})
    assert res.status_code == 422

    # Invalid color
    res = await auth_client.post("/api/areas/", json={"name": "X", "color": "red"})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_get_areas(auth_client: AsyncClient):
    await auth_client.post("/api/areas/", json={"name": "Area 1"})
    await auth_client.post("/api/areas/", json={"name": "Area 2"})
    res = await auth_client.get("/api/areas/")
    assert res.status_code == 200
    assert len(res.json()) >= 2


@pytest.mark.asyncio
async def test_update_area(auth_client: AsyncClient):
    create = await auth_client.post("/api/areas/", json={"name": "Old"})
    area_id = create.json()["id"]
    res = await auth_client.patch(f"/api/areas/{area_id}", json={"name": "New", "color": "#EF4444"})
    assert res.status_code == 200
    assert res.json()["name"] == "New"
    assert res.json()["color"] == "#EF4444"


@pytest.mark.asyncio
async def test_delete_area(auth_client: AsyncClient):
    create = await auth_client.post("/api/areas/", json={"name": "Delete Me"})
    area_id = create.json()["id"]
    res = await auth_client.delete(f"/api/areas/{area_id}")
    assert res.status_code == 200

    areas = await auth_client.get("/api/areas/")
    ids = [a["id"] for a in areas.json()]
    assert area_id not in ids


@pytest.mark.asyncio
async def test_reorder_areas(auth_client: AsyncClient):
    a1 = (await auth_client.post("/api/areas/", json={"name": "First"})).json()
    a2 = (await auth_client.post("/api/areas/", json={"name": "Second"})).json()
    a3 = (await auth_client.post("/api/areas/", json={"name": "Third"})).json()

    res = await auth_client.patch("/api/areas/reorder", json={"ids": [a3["id"], a1["id"], a2["id"]]})
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_area_idor(client: AsyncClient):
    """User cannot update/delete another user's area."""
    u1 = await register_user(client, "a1@test.com", "User1")
    u2 = await register_user(client, "a2@test.com", "User2")

    area = await create_area(client, u1["headers"], "Private Area")
    area_id = area["id"]

    # User 2 tries to update
    res = await client.patch(f"/api/areas/{area_id}", json={"name": "Hacked"}, headers=u2["headers"])
    assert res.status_code == 404

    # User 2 tries to delete
    res = await client.delete(f"/api/areas/{area_id}", headers=u2["headers"])
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_areas_isolated_per_user(client: AsyncClient):
    """Users only see their own areas."""
    u1 = await register_user(client, "iso1@test.com", "U1")
    u2 = await register_user(client, "iso2@test.com", "U2")

    await create_area(client, u1["headers"], "U1 Area")
    await create_area(client, u2["headers"], "U2 Area")

    res1 = await client.get("/api/areas/", headers=u1["headers"])
    res2 = await client.get("/api/areas/", headers=u2["headers"])

    names1 = [a["name"] for a in res1.json()]
    names2 = [a["name"] for a in res2.json()]

    assert "U1 Area" in names1
    assert "U2 Area" not in names1
    assert "U2 Area" in names2
    assert "U1 Area" not in names2
