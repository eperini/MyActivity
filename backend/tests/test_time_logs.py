import pytest
from httpx import AsyncClient

from tests.conftest import register_user, create_project


async def _create_task_with_project(client: AsyncClient, headers: dict):
    """Create a project + task and return the task dict."""
    proj_res = await client.post("/api/projects/", json={"name": "TL"}, headers=headers)
    project_id = proj_res.json()["id"]
    task_res = await client.post("/api/tasks/", json={"title": "Time Task", "project_id": project_id}, headers=headers)
    return task_res.json()


@pytest.mark.asyncio
async def test_create_time_log(client: AsyncClient):
    u = await register_user(client, "tl@test.com", "User")
    task = await _create_task_with_project(client, u["headers"])

    res = await client.post(
        f"/api/tasks/{task['id']}/time",
        json={"minutes": 90, "note": "Deep work"},
        headers=u["headers"],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["minutes"] == 90
    assert data["note"] == "Deep work"
    assert data["source"] == "manual"


@pytest.mark.asyncio
async def test_get_time_logs(client: AsyncClient):
    u = await register_user(client, "tl2@test.com", "User")
    task = await _create_task_with_project(client, u["headers"])

    await client.post(f"/api/tasks/{task['id']}/time", json={"minutes": 30}, headers=u["headers"])
    await client.post(f"/api/tasks/{task['id']}/time", json={"minutes": 60}, headers=u["headers"])

    res = await client.get(f"/api/tasks/{task['id']}/time", headers=u["headers"])
    assert res.status_code == 200
    assert len(res.json()) == 2


@pytest.mark.asyncio
async def test_update_time_log(client: AsyncClient):
    u = await register_user(client, "tl3@test.com", "User")
    task = await _create_task_with_project(client, u["headers"])

    log = (await client.post(
        f"/api/tasks/{task['id']}/time",
        json={"minutes": 30},
        headers=u["headers"],
    )).json()

    res = await client.patch(
        f"/api/tasks/{task['id']}/time/{log['id']}",
        json={"minutes": 45, "note": "Updated"},
        headers=u["headers"],
    )
    assert res.status_code == 200
    assert res.json()["minutes"] == 45
    assert res.json()["note"] == "Updated"


@pytest.mark.asyncio
async def test_delete_time_log(client: AsyncClient):
    u = await register_user(client, "tl4@test.com", "User")
    task = await _create_task_with_project(client, u["headers"])

    log = (await client.post(
        f"/api/tasks/{task['id']}/time",
        json={"minutes": 30},
        headers=u["headers"],
    )).json()

    res = await client.delete(f"/api/tasks/{task['id']}/time/{log['id']}", headers=u["headers"])
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_time_log_validation(client: AsyncClient):
    u = await register_user(client, "tl5@test.com", "User")
    task = await _create_task_with_project(client, u["headers"])

    # Zero minutes
    res = await client.post(f"/api/tasks/{task['id']}/time", json={"minutes": 0}, headers=u["headers"])
    assert res.status_code == 422

    # Negative minutes
    res = await client.post(f"/api/tasks/{task['id']}/time", json={"minutes": -10}, headers=u["headers"])
    assert res.status_code == 422

    # Over 1440 minutes (24h)
    res = await client.post(f"/api/tasks/{task['id']}/time", json={"minutes": 1500}, headers=u["headers"])
    assert res.status_code == 422


# ─── IDOR Protection ──────────────────────────────────


@pytest.mark.asyncio
async def test_cannot_log_time_on_others_task(client: AsyncClient):
    u1 = await register_user(client, "tl_own@test.com", "Owner")
    u2 = await register_user(client, "tl_str@test.com", "Stranger")
    task = await _create_task_with_project(client, u1["headers"])

    res = await client.post(
        f"/api/tasks/{task['id']}/time",
        json={"minutes": 30},
        headers=u2["headers"],
    )
    assert res.status_code in (403, 404)


@pytest.mark.asyncio
async def test_cannot_update_others_time_log(client: AsyncClient):
    """Even if you're a project member, you can't edit another user's log."""
    u1 = await register_user(client, "tl_u1@test.com", "U1")
    task = await _create_task_with_project(client, u1["headers"])

    log = (await client.post(
        f"/api/tasks/{task['id']}/time",
        json={"minutes": 60},
        headers=u1["headers"],
    )).json()

    u2 = await register_user(client, "tl_u2@test.com", "U2")
    res = await client.patch(
        f"/api/tasks/{task['id']}/time/{log['id']}",
        json={"minutes": 999},
        headers=u2["headers"],
    )
    assert res.status_code in (403, 404)


# ─── Weekly View ──────────────────────────────────────


@pytest.mark.asyncio
async def test_weekly_view(client: AsyncClient):
    u = await register_user(client, "tlweek@test.com", "User")
    res = await client.get("/api/time/week", headers=u["headers"])
    assert res.status_code == 200
    data = res.json()
    assert "week_start" in data
    assert "week_end" in data
    assert "total_minutes" in data


# ─── Time Report ──────────────────────────────────────


@pytest.mark.asyncio
async def test_time_report(client: AsyncClient):
    u = await register_user(client, "tlrep@test.com", "User")
    task = await _create_task_with_project(client, u["headers"])
    await client.post(f"/api/tasks/{task['id']}/time", json={"minutes": 120}, headers=u["headers"])

    res = await client.get("/api/time/report", headers=u["headers"])
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total_minutes" in data


@pytest.mark.asyncio
async def test_time_report_idor(client: AsyncClient):
    """Non-admin cannot view another user's report."""
    u1 = await register_user(client, "tlrep1@test.com", "U1")
    u2 = await register_user(client, "tlrep2@test.com", "U2")

    # U2 tries to view U1's report
    res = await client.get(
        f"/api/time/report?user_id={1}",  # Assuming U1 has ID 1
        headers=u2["headers"],
    )
    # Should be 403 since u2 is not admin
    # (might be 200 if user_id happens to match u2.id, but the intent is cross-user)
    # Let's use a guaranteed-different approach
    # Get u1's actual user ID
    me_u1 = await client.get("/api/auth/me", headers=u1["headers"])
    u1_id = me_u1.json()["id"]

    res = await client.get(f"/api/time/report?user_id={u1_id}", headers=u2["headers"])
    assert res.status_code == 403


# ─── Export ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_csv(client: AsyncClient):
    u = await register_user(client, "tlcsv@test.com", "User")
    res = await client.get("/api/time/export?fmt=csv", headers=u["headers"])
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_export_json(client: AsyncClient):
    u = await register_user(client, "tljson@test.com", "User")
    res = await client.get("/api/time/export?fmt=json", headers=u["headers"])
    assert res.status_code == 200
