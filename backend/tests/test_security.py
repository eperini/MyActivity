"""Cross-cutting security tests: IDOR, auth, input validation."""
import pytest
from httpx import AsyncClient

from tests.conftest import register_user, create_project


@pytest.mark.asyncio
async def test_all_endpoints_require_auth(client: AsyncClient):
    """Key endpoints reject unauthenticated requests."""
    endpoints = [
        ("GET", "/api/areas/"),
        ("GET", "/api/projects/"),
        ("GET", "/api/tasks/"),
        ("GET", "/api/habits/"),
        ("GET", "/api/notifications/"),
        ("GET", "/api/notifications/unread-count"),
        ("GET", "/api/time/week"),
        ("GET", "/api/time/report"),
        ("GET", "/api/invitations/pending/me"),
    ]
    for method, url in endpoints:
        if method == "GET":
            res = await client.get(url)
        else:
            res = await client.post(url)
        assert res.status_code in (401, 403), f"{method} {url} returned {res.status_code}"


@pytest.mark.asyncio
async def test_nonexistent_resource_returns_404(auth_client: AsyncClient):
    """Accessing non-existent resources returns 404, not 500."""
    endpoints = [
        ("GET", "/api/projects/99999"),
        ("PATCH", "/api/notifications/99999/read"),
    ]
    for method, url in endpoints:
        if method == "GET":
            res = await auth_client.get(url)
        else:
            res = await auth_client.patch(url)
        assert res.status_code in (404, 403, 422), f"{method} {url} returned {res.status_code}"


@pytest.mark.asyncio
async def test_cross_user_project_isolation(client: AsyncClient):
    """Complete isolation test: user cannot access another user's project resources."""
    u1 = await register_user(client, "sec1@test.com", "User1")
    u2 = await register_user(client, "sec2@test.com", "User2")

    # U1 creates project
    project = await create_project(client, u1["headers"], "Secret Project")
    pid = project["id"]

    # U2 cannot: get project
    assert (await client.get(f"/api/projects/{pid}", headers=u2["headers"])).status_code == 403

    # U2 cannot: update project
    assert (await client.patch(
        f"/api/projects/{pid}", json={"name": "Hacked"}, headers=u2["headers"]
    )).status_code == 403

    # U2 cannot: delete project
    assert (await client.delete(f"/api/projects/{pid}", headers=u2["headers"])).status_code == 403

    # U2 cannot: list members
    assert (await client.get(f"/api/projects/{pid}/members", headers=u2["headers"])).status_code == 403

    # U2 cannot: add member
    assert (await client.post(
        f"/api/projects/{pid}/members",
        json={"email": "anyone@test.com", "role": "user"},
        headers=u2["headers"],
    )).status_code == 403

    # U2 cannot: list epics
    assert (await client.get(f"/api/projects/{pid}/epics", headers=u2["headers"])).status_code == 403

    # U2 cannot: create epic
    assert (await client.post(
        f"/api/projects/{pid}/epics",
        json={"name": "Hacked"},
        headers=u2["headers"],
    )).status_code == 403

    # U2 cannot: list custom fields
    assert (await client.get(f"/api/projects/{pid}/fields/", headers=u2["headers"])).status_code == 403

    # U2 cannot: list invitations
    assert (await client.get(f"/api/projects/{pid}/invitations/", headers=u2["headers"])).status_code == 403


@pytest.mark.asyncio
async def test_role_escalation_prevention(client: AsyncClient):
    """User-role member cannot perform admin actions."""
    owner = await register_user(client, "secown@test.com", "Owner")
    member = await register_user(client, "secmem@test.com", "Member")
    project = await create_project(client, owner["headers"], "Roles Project")
    pid = project["id"]

    # Add member as user
    await client.post(
        f"/api/projects/{pid}/members",
        json={"email": "secmem@test.com", "role": "user"},
        headers=owner["headers"],
    )

    # Member (user role) cannot: update project
    assert (await client.patch(
        f"/api/projects/{pid}", json={"name": "Hacked"}, headers=member["headers"]
    )).status_code == 403

    # Member cannot: delete project
    assert (await client.delete(f"/api/projects/{pid}", headers=member["headers"])).status_code == 403

    # Member cannot: add other members
    assert (await client.post(
        f"/api/projects/{pid}/members",
        json={"email": "anyone@test.com", "role": "user"},
        headers=member["headers"],
    )).status_code == 403

    # Member cannot: send invitations
    assert (await client.post(
        f"/api/projects/{pid}/invitations/",
        json={"email": "anyone@test.com", "role": "user"},
        headers=member["headers"],
    )).status_code == 403

    # Member cannot: manage custom fields
    assert (await client.post(
        f"/api/projects/{pid}/fields/",
        json={"name": "Hack", "field_key": "hack", "field_type": "text"},
        headers=member["headers"],
    )).status_code == 403

    # But member CAN: read project
    assert (await client.get(f"/api/projects/{pid}", headers=member["headers"])).status_code == 200

    # And CAN: list epics
    assert (await client.get(f"/api/projects/{pid}/epics", headers=member["headers"])).status_code == 200

    # And CAN: view stats
    assert (await client.get(f"/api/projects/{pid}/stats", headers=member["headers"])).status_code == 200


@pytest.mark.asyncio
async def test_sql_injection_prevention(auth_client: AsyncClient):
    """SQL injection attempts should be safely handled."""
    payloads = [
        "'; DROP TABLE users; --",
        "1 OR 1=1",
        "' UNION SELECT * FROM users --",
    ]
    for payload in payloads:
        res = await auth_client.post("/api/areas/", json={"name": payload})
        # Should either succeed (safe storage) or return validation error, never 500
        assert res.status_code in (200, 422), f"Payload '{payload}' returned {res.status_code}"

        res = await auth_client.post("/api/projects/", json={"name": payload})
        assert res.status_code in (200, 422), f"Payload '{payload}' returned {res.status_code}"


@pytest.mark.asyncio
async def test_large_payload_handling(auth_client: AsyncClient):
    """Oversized inputs should be rejected cleanly."""
    # Overly long name
    res = await auth_client.post("/api/areas/", json={"name": "A" * 200})
    assert res.status_code == 422

    # Overly long project description
    res = await auth_client.post("/api/projects/", json={
        "name": "P",
        "description": "X" * 6000,
    })
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_invalid_bearer_token(client: AsyncClient):
    """Invalid/expired tokens should return 401/403."""
    headers = {"Authorization": "Bearer invalid-token-here"}
    res = await client.get("/api/projects/", headers=headers)
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    """Health check should always work without auth."""
    res = await client.get("/api/health")
    assert res.status_code == 200
