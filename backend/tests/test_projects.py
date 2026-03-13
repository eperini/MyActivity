import pytest
from httpx import AsyncClient

from tests.conftest import register_user, create_area, create_project


@pytest.mark.asyncio
async def test_create_project(auth_client: AsyncClient):
    res = await auth_client.post("/api/projects/", json={
        "name": "My Project",
        "description": "A test project",
        "color": "#10B981",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "My Project"
    assert data["description"] == "A test project"
    assert data["color"] == "#10B981"
    assert data["status"] == "active"
    assert data["task_count"] == 0


@pytest.mark.asyncio
async def test_create_project_with_area(auth_client: AsyncClient):
    area = (await auth_client.post("/api/areas/", json={"name": "Work"})).json()
    res = await auth_client.post("/api/projects/", json={
        "name": "Work Project",
        "area_id": area["id"],
    })
    assert res.status_code == 200
    assert res.json()["area_id"] == area["id"]


@pytest.mark.asyncio
async def test_create_project_invalid_area(client: AsyncClient):
    """Cannot create project with another user's area."""
    u1 = await register_user(client, "p1@test.com", "U1")
    u2 = await register_user(client, "p2@test.com", "U2")

    area = await create_area(client, u1["headers"], "U1 Area")
    res = await client.post("/api/projects/", json={
        "name": "Hacked",
        "area_id": area["id"],
    }, headers=u2["headers"])
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_projects(auth_client: AsyncClient):
    await auth_client.post("/api/projects/", json={"name": "P1"})
    await auth_client.post("/api/projects/", json={"name": "P2"})
    res = await auth_client.get("/api/projects/")
    assert res.status_code == 200
    assert len(res.json()) >= 2


@pytest.mark.asyncio
async def test_get_project(auth_client: AsyncClient):
    p = (await auth_client.post("/api/projects/", json={"name": "Single"})).json()
    res = await auth_client.get(f"/api/projects/{p['id']}")
    assert res.status_code == 200
    assert res.json()["name"] == "Single"


@pytest.mark.asyncio
async def test_update_project(auth_client: AsyncClient):
    p = (await auth_client.post("/api/projects/", json={"name": "Old Name"})).json()
    res = await auth_client.patch(f"/api/projects/{p['id']}", json={
        "name": "New Name",
        "status": "completed",
    })
    assert res.status_code == 200
    assert res.json()["name"] == "New Name"
    assert res.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_delete_project(auth_client: AsyncClient):
    p = (await auth_client.post("/api/projects/", json={"name": "Delete Me"})).json()
    res = await auth_client.delete(f"/api/projects/{p['id']}")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_project_stats(auth_client: AsyncClient):
    p = (await auth_client.post("/api/projects/", json={"name": "Stats Project"})).json()
    res = await auth_client.get(f"/api/projects/{p['id']}/stats")
    assert res.status_code == 200
    data = res.json()
    assert data["total_tasks"] == 0
    assert data["completion_pct"] == 0.0


# ─── Members & Roles ──────────────────────────────────


@pytest.mark.asyncio
async def test_owner_is_admin_member(auth_client: AsyncClient):
    p = (await auth_client.post("/api/projects/", json={"name": "Member Test"})).json()
    res = await auth_client.get(f"/api/projects/{p['id']}/members")
    assert res.status_code == 200
    members = res.json()
    assert len(members) == 1
    assert members[0]["role"] == "admin"


@pytest.mark.asyncio
async def test_add_member(client: AsyncClient):
    u1 = await register_user(client, "owner@proj.com", "Owner")
    u2 = await register_user(client, "member@proj.com", "Member")
    project = await create_project(client, u1["headers"], "Shared")

    res = await client.post(
        f"/api/projects/{project['id']}/members",
        json={"email": "member@proj.com", "role": "user"},
        headers=u1["headers"],
    )
    assert res.status_code == 200
    assert res.json()["role"] == "user"

    # Member can now access the project
    res = await client.get(f"/api/projects/{project['id']}", headers=u2["headers"])
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_add_member_nonexistent_email(auth_client: AsyncClient):
    p = (await auth_client.post("/api/projects/", json={"name": "NF"})).json()
    res = await auth_client.post(
        f"/api/projects/{p['id']}/members",
        json={"email": "ghost@nowhere.com", "role": "user"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_add_member_already_member(client: AsyncClient):
    u1 = await register_user(client, "ow2@proj.com", "Owner")
    u2 = await register_user(client, "mem2@proj.com", "Member")
    project = await create_project(client, u1["headers"], "Dup")

    await client.post(
        f"/api/projects/{project['id']}/members",
        json={"email": "mem2@proj.com", "role": "user"},
        headers=u1["headers"],
    )
    # Try again
    res = await client.post(
        f"/api/projects/{project['id']}/members",
        json={"email": "mem2@proj.com", "role": "user"},
        headers=u1["headers"],
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_change_member_role(client: AsyncClient):
    u1 = await register_user(client, "ow3@proj.com", "Owner")
    u2 = await register_user(client, "mem3@proj.com", "Member")
    project = await create_project(client, u1["headers"], "Roles")

    add_res = await client.post(
        f"/api/projects/{project['id']}/members",
        json={"email": "mem3@proj.com", "role": "user"},
        headers=u1["headers"],
    )
    member_id = add_res.json()["id"]

    res = await client.patch(
        f"/api/projects/{project['id']}/members/{member_id}",
        json={"role": "super_user"},
        headers=u1["headers"],
    )
    assert res.status_code == 200
    assert res.json()["role"] == "super_user"


@pytest.mark.asyncio
async def test_remove_member(client: AsyncClient):
    u1 = await register_user(client, "ow4@proj.com", "Owner")
    u2 = await register_user(client, "mem4@proj.com", "Member")
    project = await create_project(client, u1["headers"], "Remove")

    add_res = await client.post(
        f"/api/projects/{project['id']}/members",
        json={"email": "mem4@proj.com", "role": "user"},
        headers=u1["headers"],
    )
    member_id = add_res.json()["id"]

    res = await client.delete(
        f"/api/projects/{project['id']}/members/{member_id}",
        headers=u1["headers"],
    )
    assert res.status_code == 200

    # Member no longer has access
    res = await client.get(f"/api/projects/{project['id']}", headers=u2["headers"])
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_cannot_remove_owner(client: AsyncClient):
    u1 = await register_user(client, "ow5@proj.com", "Owner")
    project = await create_project(client, u1["headers"], "NoRemoveOwner")

    members = await client.get(f"/api/projects/{project['id']}/members", headers=u1["headers"])
    owner_member_id = members.json()[0]["id"]

    res = await client.delete(
        f"/api/projects/{project['id']}/members/{owner_member_id}",
        headers=u1["headers"],
    )
    assert res.status_code == 400


# ─── Access Control ──────────────────────────────────


@pytest.mark.asyncio
async def test_non_member_cannot_access(client: AsyncClient):
    u1 = await register_user(client, "ow6@proj.com", "Owner")
    u2 = await register_user(client, "stranger@proj.com", "Stranger")
    project = await create_project(client, u1["headers"], "Private")

    res = await client.get(f"/api/projects/{project['id']}", headers=u2["headers"])
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_user_role_cannot_update_project(client: AsyncClient):
    u1 = await register_user(client, "ow7@proj.com", "Owner")
    u2 = await register_user(client, "usr7@proj.com", "User")
    project = await create_project(client, u1["headers"], "ReadOnly")

    await client.post(
        f"/api/projects/{project['id']}/members",
        json={"email": "usr7@proj.com", "role": "user"},
        headers=u1["headers"],
    )

    # User role cannot update project (requires admin)
    res = await client.patch(
        f"/api/projects/{project['id']}",
        json={"name": "Hacked"},
        headers=u2["headers"],
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_user_role_cannot_add_member(client: AsyncClient):
    u1 = await register_user(client, "ow8@proj.com", "Owner")
    u2 = await register_user(client, "usr8@proj.com", "User")
    u3 = await register_user(client, "usr8b@proj.com", "User3")
    project = await create_project(client, u1["headers"], "NoAdd")

    await client.post(
        f"/api/projects/{project['id']}/members",
        json={"email": "usr8@proj.com", "role": "user"},
        headers=u1["headers"],
    )

    # User role cannot add members
    res = await client.post(
        f"/api/projects/{project['id']}/members",
        json={"email": "usr8b@proj.com", "role": "user"},
        headers=u2["headers"],
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_projects_isolated_per_user(client: AsyncClient):
    """Users only see projects they are members of."""
    u1 = await register_user(client, "iso1@proj.com", "U1")
    u2 = await register_user(client, "iso2@proj.com", "U2")

    await create_project(client, u1["headers"], "U1 Project")
    await create_project(client, u2["headers"], "U2 Project")

    res1 = await client.get("/api/projects/", headers=u1["headers"])
    res2 = await client.get("/api/projects/", headers=u2["headers"])

    names1 = [p["name"] for p in res1.json()]
    names2 = [p["name"] for p in res2.json()]

    assert "U1 Project" in names1
    assert "U2 Project" not in names1
    assert "U2 Project" in names2
    assert "U1 Project" not in names2
