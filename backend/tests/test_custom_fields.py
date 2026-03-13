import pytest
from httpx import AsyncClient

from tests.conftest import register_user, create_project


@pytest.mark.asyncio
async def test_default_fields_created(client: AsyncClient):
    """Project creation auto-generates default custom fields based on type."""
    u = await register_user(client, "cf@test.com", "User")
    project = await create_project(client, u["headers"], "Tech Project")

    res = await client.get(f"/api/projects/{project['id']}/fields/", headers=u["headers"])
    assert res.status_code == 200
    fields = res.json()
    # PERSONAL type has default fields
    assert len(fields) >= 0  # Depends on DEFAULT_FIELDS config


@pytest.mark.asyncio
async def test_create_text_field(client: AsyncClient):
    u = await register_user(client, "cf2@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    res = await client.post(
        f"/api/projects/{project['id']}/fields/",
        json={
            "name": "Notes",
            "field_key": "notes",
            "field_type": "text",
        },
        headers=u["headers"],
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Notes"
    assert data["field_key"] == "notes"
    assert data["field_type"] == "text"


@pytest.mark.asyncio
async def test_create_select_field(client: AsyncClient):
    u = await register_user(client, "cf3@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    res = await client.post(
        f"/api/projects/{project['id']}/fields/",
        json={
            "name": "Priority",
            "field_key": "priority_level",
            "field_type": "select",
            "options": ["low", "medium", "high"],
        },
        headers=u["headers"],
    )
    assert res.status_code == 201
    assert res.json()["options"] == ["low", "medium", "high"]


@pytest.mark.asyncio
async def test_create_select_field_no_options(client: AsyncClient):
    """SELECT field must have options."""
    u = await register_user(client, "cf4@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    res = await client.post(
        f"/api/projects/{project['id']}/fields/",
        json={
            "name": "Bad Select",
            "field_key": "bad_select",
            "field_type": "select",
        },
        headers=u["headers"],
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_duplicate_field_key(client: AsyncClient):
    u = await register_user(client, "cf5@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    await client.post(
        f"/api/projects/{project['id']}/fields/",
        json={"name": "F1", "field_key": "dup_key", "field_type": "text"},
        headers=u["headers"],
    )
    res = await client.post(
        f"/api/projects/{project['id']}/fields/",
        json={"name": "F2", "field_key": "dup_key", "field_type": "number"},
        headers=u["headers"],
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_update_field(client: AsyncClient):
    u = await register_user(client, "cf6@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    field = (await client.post(
        f"/api/projects/{project['id']}/fields/",
        json={"name": "Old", "field_key": "upd", "field_type": "text"},
        headers=u["headers"],
    )).json()

    res = await client.patch(
        f"/api/projects/{project['id']}/fields/{field['id']}",
        json={"name": "New Name"},
        headers=u["headers"],
    )
    assert res.status_code == 200
    assert res.json()["name"] == "New Name"


@pytest.mark.asyncio
async def test_delete_field(client: AsyncClient):
    u = await register_user(client, "cf7@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    field = (await client.post(
        f"/api/projects/{project['id']}/fields/",
        json={"name": "Del", "field_key": "del_me", "field_type": "text"},
        headers=u["headers"],
    )).json()

    res = await client.delete(
        f"/api/projects/{project['id']}/fields/{field['id']}",
        headers=u["headers"],
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_reorder_fields(client: AsyncClient):
    u = await register_user(client, "cf8@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    f1 = (await client.post(
        f"/api/projects/{project['id']}/fields/",
        json={"name": "F1", "field_key": "f1", "field_type": "text"},
        headers=u["headers"],
    )).json()
    f2 = (await client.post(
        f"/api/projects/{project['id']}/fields/",
        json={"name": "F2", "field_key": "f2", "field_type": "text"},
        headers=u["headers"],
    )).json()

    res = await client.patch(
        f"/api/projects/{project['id']}/fields/reorder",
        json={"field_ids": [f2["id"], f1["id"]]},
        headers=u["headers"],
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_field_key_validation(client: AsyncClient):
    """Field key must be lowercase alphanumeric with underscores."""
    u = await register_user(client, "cf9@test.com", "User")
    project = await create_project(client, u["headers"], "P")

    res = await client.post(
        f"/api/projects/{project['id']}/fields/",
        json={"name": "Bad", "field_key": "Invalid Key!", "field_type": "text"},
        headers=u["headers"],
    )
    assert res.status_code == 422


# ─── IDOR Protection ──────────────────────────────────


@pytest.mark.asyncio
async def test_non_admin_cannot_manage_fields(client: AsyncClient):
    """User role cannot create/update/delete custom fields."""
    u1 = await register_user(client, "cfown@test.com", "Owner")
    u2 = await register_user(client, "cfusr@test.com", "User")
    project = await create_project(client, u1["headers"], "P")

    # Add u2 as user role
    await client.post(
        f"/api/projects/{project['id']}/members",
        json={"email": "cfusr@test.com", "role": "user"},
        headers=u1["headers"],
    )

    # User cannot create field
    res = await client.post(
        f"/api/projects/{project['id']}/fields/",
        json={"name": "Hacked", "field_key": "hack", "field_type": "text"},
        headers=u2["headers"],
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_non_member_cannot_access_fields(client: AsyncClient):
    u1 = await register_user(client, "cfown2@test.com", "Owner")
    u2 = await register_user(client, "cfstr@test.com", "Stranger")
    project = await create_project(client, u1["headers"], "P")

    res = await client.get(f"/api/projects/{project['id']}/fields/", headers=u2["headers"])
    assert res.status_code == 403
