"""
Jira Cloud REST API v3 service.
Both async (for FastAPI) and sync (for Celery workers) versions.
"""

import logging
from base64 import b64encode
from datetime import datetime

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def _get_auth_headers() -> dict:
    if not settings.JIRA_EMAIL or not settings.JIRA_API_TOKEN:
        raise RuntimeError("Jira credentials not configured")
    token = b64encode(
        f"{settings.JIRA_EMAIL}:{settings.JIRA_API_TOKEN}".encode()
    ).decode()
    return {
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


class JiraService:
    """Async Jira client for FastAPI endpoints."""

    def __init__(self):
        self.headers = _get_auth_headers()
        self.base_url = settings.JIRA_BASE_URL.rstrip("/")

    async def get_projects(self) -> list[dict]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/rest/api/3/project",
                headers=self.headers,
                timeout=30,
            )
            resp.raise_for_status()
            return [{"key": p["key"], "name": p["name"]} for p in resp.json()]

    async def get_project_members(self, project_key: str) -> list[dict]:
        """Fetch users assignable to issues in a Jira project."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/rest/api/3/user/assignable/search",
                headers=self.headers,
                params={"project": project_key, "maxResults": 200},
                timeout=30,
            )
            resp.raise_for_status()
            return [
                {
                    "accountId": u["accountId"],
                    "displayName": u.get("displayName", ""),
                    "emailAddress": u.get("emailAddress"),
                }
                for u in resp.json()
                if u.get("accountType") == "atlassian"
            ]

    async def get_project_issues(
        self, project_key: str, updated_after: datetime | None = None
    ) -> list[dict]:
        jql = f"project = {project_key} ORDER BY updated DESC"
        if updated_after:
            ts = updated_after.strftime("%Y-%m-%d %H:%M")
            jql = f"project = {project_key} AND updated >= '{ts}' ORDER BY updated DESC"

        params = {
            "jql": jql,
            "maxResults": 100,
            "fields": "summary,description,status,priority,assignee,duedate,updated,issuetype",
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/rest/api/3/search/jql",
                headers=self.headers,
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json().get("issues", [])

    async def create_issue(self, project_key: str, task_data: dict) -> dict:
        payload = {
            "fields": {
                "project": {"key": project_key},
                "summary": task_data["title"],
                "description": _to_adf(task_data.get("description") or ""),
                "issuetype": {"name": "Task"},
                "priority": {"name": map_priority_to_jira(task_data["priority"])},
            }
        }
        if task_data.get("due_date"):
            payload["fields"]["duedate"] = task_data["due_date"]

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/rest/api/3/issue",
                headers=self.headers,
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def update_issue(self, issue_id: str, fields: dict) -> None:
        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{self.base_url}/rest/api/3/issue/{issue_id}",
                headers=self.headers,
                json={"fields": fields},
                timeout=30,
            )
            resp.raise_for_status()

    async def transition_issue(self, issue_id: str, status: str) -> None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/rest/api/3/issue/{issue_id}/transitions",
                headers=self.headers,
                timeout=30,
            )
            transitions = resp.json().get("transitions", [])

            target_name = map_status_to_jira(status)
            transition = next(
                (t for t in transitions if t["name"].lower() == target_name.lower()),
                None,
            )
            if not transition:
                logger.debug(
                    "No transition found for status '%s' (target: '%s') on issue %s. Available: %s",
                    status, target_name, issue_id,
                    [t["name"] for t in transitions],
                )
                return

            await client.post(
                f"{self.base_url}/rest/api/3/issue/{issue_id}/transitions",
                headers=self.headers,
                json={"transition": {"id": transition["id"]}},
                timeout=30,
            )


    async def get_project_epics(self, project_key: str) -> list[dict]:
        """Fetch all Epics for a Jira project."""
        jql = f"project = {project_key} AND issuetype = Epic ORDER BY created ASC"
        params = {
            "jql": jql,
            "maxResults": 200,
            "fields": "summary,description,status,priority,duedate,updated",
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/rest/api/3/search/jql",
                headers=self.headers,
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json().get("issues", [])

    async def create_epic(
        self, project_key: str, name: str, description: str = ""
    ) -> dict:
        """Create an Epic on Jira."""
        epic_name_field = getattr(settings, "JIRA_EPIC_NAME_FIELD", "customfield_10011")
        payload = {
            "fields": {
                "project": {"key": project_key},
                "summary": name,
                "issuetype": {"name": "Epic"},
                epic_name_field: name,
                "description": _to_adf(description),
            }
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/rest/api/3/issue",
                headers=self.headers,
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()


class JiraServiceSync:
    """Sync Jira client for Celery workers."""

    def __init__(self):
        self.headers = _get_auth_headers()
        self.base_url = settings.JIRA_BASE_URL.rstrip("/")

    def get_project_issues(
        self, project_key: str, updated_after: datetime | None = None
    ) -> list[dict]:
        jql = f"project = {project_key} ORDER BY updated DESC"
        if updated_after:
            ts = updated_after.strftime("%Y-%m-%d %H:%M")
            jql = f"project = {project_key} AND updated >= '{ts}' ORDER BY updated DESC"

        params = {
            "jql": jql,
            "maxResults": 100,
            "fields": "summary,description,status,priority,assignee,duedate,updated,issuetype",
        }
        with httpx.Client() as client:
            resp = client.get(
                f"{self.base_url}/rest/api/3/search/jql",
                headers=self.headers,
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json().get("issues", [])

    def get_project_epics_sync(self, project_key: str) -> list[dict]:
        """Fetch all Epics for a Jira project (sync version)."""
        jql = f"project = {project_key} AND issuetype = Epic ORDER BY created ASC"
        params = {
            "jql": jql,
            "maxResults": 200,
            "fields": "summary,description,status,priority,duedate,updated",
        }
        with httpx.Client() as client:
            resp = client.get(
                f"{self.base_url}/rest/api/3/search/jql",
                headers=self.headers,
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json().get("issues", [])


# ── Mapping helpers ──────────────────────────────────────────────────

def map_priority_to_jira(priority: int) -> str:
    return {1: "Highest", 2: "High", 3: "Medium", 4: "Low"}.get(priority, "Medium")


def map_priority_from_jira(jira_priority: str) -> int:
    return {
        "highest": 1, "high": 2, "medium": 3, "low": 4, "lowest": 4
    }.get(jira_priority.lower(), 3)


def map_status_to_jira(status: str) -> str:
    return {"todo": "To Do", "doing": "In Progress", "done": "Done"}.get(status, "To Do")


def map_status_from_jira(jira_status: str) -> str:
    mapping = {
        "to do": "todo", "open": "todo", "backlog": "todo",
        "in progress": "doing", "in review": "doing",
        "done": "done", "closed": "done", "resolved": "done",
    }
    return mapping.get(jira_status.lower(), "todo")


def _to_adf(text: str) -> dict:
    """Convert plain text to minimal Atlassian Document Format."""
    if text:
        return {
            "type": "doc",
            "version": 1,
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": text}]}
            ],
        }
    return {"type": "doc", "version": 1, "content": []}


def extract_adf_text(adf: dict | None) -> str:
    """Extract plain text from Atlassian Document Format."""
    if not adf:
        return ""
    texts: list[str] = []

    def _walk(node: dict) -> None:
        if node.get("type") == "text":
            texts.append(node.get("text", ""))
        for child in node.get("content", []):
            _walk(child)

    _walk(adf)
    return " ".join(texts).strip()
