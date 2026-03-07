import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_task(auth_client: AsyncClient):
    # Create list first
    list_res = await auth_client.post("/api/lists/", json={"name": "Tasks List"})
    list_id = list_res.json()["id"]

    res = await auth_client.post("/api/tasks/", json={
        "title": "Test Task",
        "list_id": list_id,
        "priority": 2,
    })
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "Test Task"
    assert data["priority"] == 2
    assert data["status"] == "todo"


@pytest.mark.asyncio
async def test_get_tasks(auth_client: AsyncClient):
    list_res = await auth_client.post("/api/lists/", json={"name": "My List"})
    list_id = list_res.json()["id"]
    await auth_client.post("/api/tasks/", json={"title": "Task 1", "list_id": list_id})
    await auth_client.post("/api/tasks/", json={"title": "Task 2", "list_id": list_id})

    res = await auth_client.get("/api/tasks/")
    assert res.status_code == 200
    assert len(res.json()) >= 2


@pytest.mark.asyncio
async def test_update_task(auth_client: AsyncClient):
    list_res = await auth_client.post("/api/lists/", json={"name": "UList"})
    list_id = list_res.json()["id"]
    create = await auth_client.post("/api/tasks/", json={"title": "Old", "list_id": list_id})
    task_id = create.json()["id"]

    res = await auth_client.patch(f"/api/tasks/{task_id}", json={"title": "Updated", "status": "doing"})
    assert res.status_code == 200
    assert res.json()["title"] == "Updated"
    assert res.json()["status"] == "doing"


@pytest.mark.asyncio
async def test_complete_task(auth_client: AsyncClient):
    list_res = await auth_client.post("/api/lists/", json={"name": "Complete"})
    list_id = list_res.json()["id"]
    create = await auth_client.post("/api/tasks/", json={"title": "Do this", "list_id": list_id})
    task_id = create.json()["id"]

    res = await auth_client.patch(f"/api/tasks/{task_id}", json={"status": "done"})
    assert res.status_code == 200
    assert res.json()["status"] == "done"


@pytest.mark.asyncio
async def test_delete_task(auth_client: AsyncClient):
    list_res = await auth_client.post("/api/lists/", json={"name": "Del"})
    list_id = list_res.json()["id"]
    create = await auth_client.post("/api/tasks/", json={"title": "Delete me", "list_id": list_id})
    task_id = create.json()["id"]

    res = await auth_client.delete(f"/api/tasks/{task_id}")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_task_idor_protection(client: AsyncClient):
    """User cannot update another user's task."""
    # User 1
    r1 = await client.post("/api/auth/register", json={
        "email": "u1@task.com", "password": "securepass1", "display_name": "U1"
    })
    t1 = r1.json()["access_token"]
    h1 = {"Authorization": f"Bearer {t1}"}
    list_res = await client.post("/api/lists/", json={"name": "U1 List"}, headers=h1)
    list_id = list_res.json()["id"]
    task_res = await client.post("/api/tasks/", json={"title": "U1 Task", "list_id": list_id}, headers=h1)
    task_id = task_res.json()["id"]

    # User 2
    r2 = await client.post("/api/auth/register", json={
        "email": "u2@task.com", "password": "securepass1", "display_name": "U2"
    })
    t2 = r2.json()["access_token"]
    h2 = {"Authorization": f"Bearer {t2}"}

    # User 2 tries to update User 1's task (gets 403 or 404 - both are valid IDOR protection)
    res = await client.patch(f"/api/tasks/{task_id}", json={"title": "Hacked"}, headers=h2)
    assert res.status_code in (403, 404)


@pytest.mark.asyncio
async def test_create_task_invalid_priority(auth_client: AsyncClient):
    list_res = await auth_client.post("/api/lists/", json={"name": "Prio"})
    list_id = list_res.json()["id"]
    res = await auth_client.post("/api/tasks/", json={
        "title": "Bad Priority", "list_id": list_id, "priority": 10,
    })
    assert res.status_code == 422
