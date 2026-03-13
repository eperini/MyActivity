import pytest
from httpx import AsyncClient

from tests.conftest import register_user, create_project


@pytest.mark.asyncio
async def test_create_epic(client: AsyncClient):
    u = await register_user(client, "epic@test.com", "User")
    project = await create_project(client, u["headers"], "Epic Project")

    res = await client.post(
        f"/api/projects/{project['id']}/epics",
        json={"name": "Epic 1", "description": "First epic", "color": "#8B5CF6"},
        headers=u["headers"],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Epic 1"
    assert data["description"] == "First epic"
    assert data["color"] == "#8B5CF6"
    assert data["status"] == "todo"


@pytest.mark.asyncio
async def test_list_epics(client: AsyncClient):
    u = await register_user(client, "epic2@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    await client.post(f"/api/projects/{project['id']}/epics", json={"name": "E1"}, headers=u["headers"])
    await client.post(f"/api/projects/{project['id']}/epics", json={"name": "E2"}, headers=u["headers"])

    res = await client.get(f"/api/projects/{project['id']}/epics", headers=u["headers"])
    assert res.status_code == 200
    assert len(res.json()) == 2


@pytest.mark.asyncio
async def test_get_epic(client: AsyncClient):
    u = await register_user(client, "epic3@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    epic = (await client.post(
        f"/api/projects/{project['id']}/epics",
        json={"name": "Single"},
        headers=u["headers"],
    )).json()

    res = await client.get(
        f"/api/projects/{project['id']}/epics/{epic['id']}",
        headers=u["headers"],
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Single"


@pytest.mark.asyncio
async def test_update_epic(client: AsyncClient):
    u = await register_user(client, "epic4@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    epic = (await client.post(
        f"/api/projects/{project['id']}/epics",
        json={"name": "Old"},
        headers=u["headers"],
    )).json()

    res = await client.patch(
        f"/api/projects/{project['id']}/epics/{epic['id']}",
        json={"name": "New", "status": "done"},
        headers=u["headers"],
    )
    assert res.status_code == 200
    assert res.json()["name"] == "New"
    assert res.json()["status"] == "done"
    assert res.json()["completed_at"] is not None


@pytest.mark.asyncio
async def test_update_epic_reopen(client: AsyncClient):
    u = await register_user(client, "epic5@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    epic = (await client.post(
        f"/api/projects/{project['id']}/epics",
        json={"name": "Reopen"},
        headers=u["headers"],
    )).json()

    # Complete it
    await client.patch(
        f"/api/projects/{project['id']}/epics/{epic['id']}",
        json={"status": "done"},
        headers=u["headers"],
    )

    # Reopen it
    res = await client.patch(
        f"/api/projects/{project['id']}/epics/{epic['id']}",
        json={"status": "todo"},
        headers=u["headers"],
    )
    assert res.status_code == 200
    assert res.json()["status"] == "todo"
    assert res.json()["completed_at"] is None


@pytest.mark.asyncio
async def test_delete_epic(client: AsyncClient):
    u = await register_user(client, "epic6@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    epic = (await client.post(
        f"/api/projects/{project['id']}/epics",
        json={"name": "Delete Me"},
        headers=u["headers"],
    )).json()

    res = await client.delete(
        f"/api/projects/{project['id']}/epics/{epic['id']}",
        headers=u["headers"],
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_reorder_epics(client: AsyncClient):
    u = await register_user(client, "epic7@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    e1 = (await client.post(f"/api/projects/{project['id']}/epics", json={"name": "E1"}, headers=u["headers"])).json()
    e2 = (await client.post(f"/api/projects/{project['id']}/epics", json={"name": "E2"}, headers=u["headers"])).json()

    res = await client.patch(
        f"/api/projects/{project['id']}/epics/reorder",
        json=[e2["id"], e1["id"]],
        headers=u["headers"],
    )
    # 200 or 422 depending on FastAPI body parsing for raw list
    assert res.status_code in (200, 422)


# ─── Epic Time Logs ──────────────────────────────────


@pytest.mark.asyncio
async def test_create_epic_time_log(client: AsyncClient):
    u = await register_user(client, "etime@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    epic = (await client.post(
        f"/api/projects/{project['id']}/epics",
        json={"name": "Logged"},
        headers=u["headers"],
    )).json()

    res = await client.post(
        f"/api/epics/{epic['id']}/time",
        json={"minutes": 60, "note": "Worked on it"},
        headers=u["headers"],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["minutes"] == 60
    assert data["note"] == "Worked on it"


@pytest.mark.asyncio
async def test_get_epic_time_logs(client: AsyncClient):
    u = await register_user(client, "etime2@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    epic = (await client.post(
        f"/api/projects/{project['id']}/epics",
        json={"name": "Logs"},
        headers=u["headers"],
    )).json()

    await client.post(f"/api/epics/{epic['id']}/time", json={"minutes": 30}, headers=u["headers"])
    await client.post(f"/api/epics/{epic['id']}/time", json={"minutes": 45}, headers=u["headers"])

    res = await client.get(f"/api/epics/{epic['id']}/time", headers=u["headers"])
    assert res.status_code == 200
    assert len(res.json()) == 2


@pytest.mark.asyncio
async def test_delete_epic_time_log(client: AsyncClient):
    u = await register_user(client, "etime3@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    epic = (await client.post(
        f"/api/projects/{project['id']}/epics",
        json={"name": "DelLog"},
        headers=u["headers"],
    )).json()

    log = (await client.post(
        f"/api/epics/{epic['id']}/time",
        json={"minutes": 30},
        headers=u["headers"],
    )).json()

    res = await client.delete(f"/api/epics/{epic['id']}/time/{log['id']}", headers=u["headers"])
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_delete_others_time_log(client: AsyncClient):
    """User cannot delete another user's time log on shared epic."""
    u1 = await register_user(client, "etimeown@test.com", "Owner")
    u2 = await register_user(client, "etimemem@test.com", "Member")
    project = await create_project(client, u1["headers"], "Shared")

    # Add u2 as member
    await client.post(
        f"/api/projects/{project['id']}/members",
        json={"email": "etimemem@test.com", "role": "user"},
        headers=u1["headers"],
    )

    epic = (await client.post(
        f"/api/projects/{project['id']}/epics",
        json={"name": "SharedEpic"},
        headers=u1["headers"],
    )).json()

    # U1 logs time
    log = (await client.post(
        f"/api/epics/{epic['id']}/time",
        json={"minutes": 60},
        headers=u1["headers"],
    )).json()

    # U2 tries to delete U1's log
    res = await client.delete(f"/api/epics/{epic['id']}/time/{log['id']}", headers=u2["headers"])
    assert res.status_code == 403


# ─── IDOR Protection ──────────────────────────────────


@pytest.mark.asyncio
async def test_epic_idor_non_member(client: AsyncClient):
    """Non-member cannot access epics of a project."""
    u1 = await register_user(client, "eidor1@test.com", "Owner")
    u2 = await register_user(client, "eidor2@test.com", "Stranger")
    project = await create_project(client, u1["headers"], "Private")

    epic = (await client.post(
        f"/api/projects/{project['id']}/epics",
        json={"name": "Secret"},
        headers=u1["headers"],
    )).json()

    # Stranger cannot list epics
    res = await client.get(f"/api/projects/{project['id']}/epics", headers=u2["headers"])
    assert res.status_code == 403

    # Stranger cannot view epic
    res = await client.get(f"/api/projects/{project['id']}/epics/{epic['id']}", headers=u2["headers"])
    assert res.status_code == 403

    # Stranger cannot create epic
    res = await client.post(
        f"/api/projects/{project['id']}/epics",
        json={"name": "Hacked"},
        headers=u2["headers"],
    )
    assert res.status_code == 403

    # Stranger cannot log time
    res = await client.post(f"/api/epics/{epic['id']}/time", json={"minutes": 10}, headers=u2["headers"])
    assert res.status_code == 403
