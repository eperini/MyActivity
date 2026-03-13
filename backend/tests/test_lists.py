import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_list(auth_client: AsyncClient):
    res = await auth_client.post("/api/lists/", json={
        "name": "Test List",
        "color": "#EF4444",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Test List"
    assert data["color"] == "#EF4444"
    assert data["id"] > 0


@pytest.mark.asyncio
async def test_get_lists(auth_client: AsyncClient):
    await auth_client.post("/api/lists/", json={"name": "List A"})
    await auth_client.post("/api/lists/", json={"name": "List B"})
    res = await auth_client.get("/api/lists/")
    assert res.status_code == 200
    lists = res.json()
    assert len(lists) >= 2


@pytest.mark.asyncio
async def test_update_list(auth_client: AsyncClient):
    create = await auth_client.post("/api/lists/", json={"name": "Old Name"})
    list_id = create.json()["id"]
    res = await auth_client.patch(f"/api/lists/{list_id}", json={"name": "New Name"})
    assert res.status_code == 200
    assert res.json()["name"] == "New Name"


@pytest.mark.asyncio
async def test_delete_list(auth_client: AsyncClient):
    create = await auth_client.post("/api/lists/", json={"name": "To Delete"})
    list_id = create.json()["id"]
    res = await auth_client.delete(f"/api/lists/{list_id}")
    assert res.status_code == 200
    # Verify it's gone
    lists_res = await auth_client.get("/api/lists/")
    ids = [l["id"] for l in lists_res.json()]
    assert list_id not in ids


@pytest.mark.asyncio
async def test_update_list_not_owner(client: AsyncClient):
    # Register user1
    r1 = await client.post("/api/auth/register", json={
        "email": "owner@test.com", "password": "securepass1", "display_name": "Owner"
    })
    token1 = r1.json()["access_token"]
    # Create list as user1
    create = await client.post("/api/lists/", json={"name": "Private"},
                                headers={"Authorization": f"Bearer {token1}"})
    list_id = create.json()["id"]
    # Register user2
    r2 = await client.post("/api/auth/register", json={
        "email": "other@test.com", "password": "securepass1", "display_name": "Other"
    })
    token2 = r2.json()["access_token"]
    # Try to update as user2
    res = await client.patch(f"/api/lists/{list_id}", json={"name": "Hacked"},
                              headers={"Authorization": f"Bearer {token2}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated(client: AsyncClient):
    res = await client.get("/api/lists/")
    assert res.status_code in (401, 403)
