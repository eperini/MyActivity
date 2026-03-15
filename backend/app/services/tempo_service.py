"""Tempo Cloud API client — async + sync versions."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from functools import lru_cache

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=256)
def _resolve_jira_issue_id(issue_key: str) -> int:
    """Resolve a Jira issue key (e.g. PROJ-123) to its numeric ID via Jira REST API."""
    with httpx.Client() as client:
        resp = client.get(
            f"{settings.JIRA_BASE_URL}/rest/api/3/issue/{issue_key}?fields=id",
            auth=(settings.JIRA_EMAIL, settings.JIRA_API_TOKEN),
            timeout=15,
        )
        resp.raise_for_status()
        return int(resp.json()["id"])


class TempoService:

    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {settings.TEMPO_API_TOKEN}",
            "Accept": "application/json",
        }
        self.base_url = settings.TEMPO_BASE_URL

    async def get_worklogs(self, date_from: date, date_to: date) -> list[dict]:
        all_worklogs: list[dict] = []
        offset = 0
        limit = 1000

        while True:
            params = {
                "from": date_from.isoformat(),
                "to": date_to.isoformat(),
                "limit": limit,
                "offset": offset,
            }
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.base_url}/worklogs",
                    headers=self.headers,
                    params=params,
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()

            results = data.get("results", [])
            all_worklogs.extend(results)

            if len(results) < limit:
                break
            offset += limit

        return all_worklogs

    async def get_worklogs_chunked(
        self, date_from: date, date_to: date, chunk_days: int = 90
    ) -> list[dict]:
        all_worklogs: list[dict] = []
        current = date_from

        while current <= date_to:
            chunk_end = min(current + timedelta(days=chunk_days - 1), date_to)
            chunk = await self.get_worklogs(current, chunk_end)
            all_worklogs.extend(chunk)
            current = chunk_end + timedelta(days=1)

        return all_worklogs

    def get_worklogs_sync(self, date_from: date, date_to: date) -> list[dict]:
        all_worklogs: list[dict] = []
        offset = 0
        limit = 1000

        while True:
            params = {
                "from": date_from.isoformat(),
                "to": date_to.isoformat(),
                "limit": limit,
                "offset": offset,
            }
            with httpx.Client() as client:
                resp = client.get(
                    f"{self.base_url}/worklogs",
                    headers=self.headers,
                    params=params,
                    timeout=60,
                )
                resp.raise_for_status()
                data = resp.json()

            results = data.get("results", [])
            all_worklogs.extend(results)

            if len(results) < limit:
                break
            offset += limit

        return all_worklogs

    # ── Write operations ──────────────────────────────────────────────

    async def create_worklog(
        self, jira_issue_key: str, author_account_id: str,
        started_date: date, time_spent_seconds: int, description: str = "",
    ) -> dict:
        issue_id = _resolve_jira_issue_id(jira_issue_key)
        payload = {
            "issueId": issue_id,
            "authorAccountId": author_account_id,
            "startDate": started_date.isoformat(),
            "timeSpentSeconds": time_spent_seconds,
            "description": description,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/worklogs",
                headers=self.headers, json=payload, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def update_worklog(
        self, tempo_worklog_id: int, time_spent_seconds: int,
        started_date: date, description: str = "",
    ) -> dict:
        payload = {
            "timeSpentSeconds": time_spent_seconds,
            "startDate": started_date.isoformat(),
            "description": description,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{self.base_url}/worklogs/{tempo_worklog_id}",
                headers=self.headers, json=payload, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def delete_worklog(self, tempo_worklog_id: int) -> None:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{self.base_url}/worklogs/{tempo_worklog_id}",
                headers=self.headers, timeout=30,
            )
            resp.raise_for_status()

    # Sync versions for Celery workers

    def create_worklog_sync(
        self, jira_issue_key: str, author_account_id: str,
        started_date: date, time_spent_seconds: int, description: str = "",
    ) -> dict:
        issue_id = _resolve_jira_issue_id(jira_issue_key)
        payload = {
            "issueId": issue_id,
            "authorAccountId": author_account_id,
            "startDate": started_date.isoformat(),
            "timeSpentSeconds": time_spent_seconds,
            "description": description,
        }
        with httpx.Client() as client:
            resp = client.post(
                f"{self.base_url}/worklogs",
                headers=self.headers, json=payload, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    def update_worklog_sync(
        self, tempo_worklog_id: int, time_spent_seconds: int,
        started_date: date, description: str = "",
    ) -> dict:
        payload = {
            "timeSpentSeconds": time_spent_seconds,
            "startDate": started_date.isoformat(),
            "description": description,
        }
        with httpx.Client() as client:
            resp = client.put(
                f"{self.base_url}/worklogs/{tempo_worklog_id}",
                headers=self.headers, json=payload, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    def delete_worklog_sync(self, tempo_worklog_id: int) -> None:
        with httpx.Client() as client:
            resp = client.delete(
                f"{self.base_url}/worklogs/{tempo_worklog_id}",
                headers=self.headers, timeout=30,
            )
            resp.raise_for_status()

    async def test_connection(self) -> dict:
        """Test Tempo API connectivity. Returns status info."""
        today = date.today()
        yesterday = today - timedelta(days=1)
        params = {
            "from": yesterday.isoformat(),
            "to": today.isoformat(),
            "limit": 1,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/worklogs",
                headers=self.headers,
                params=params,
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "status": "ok",
                "total_worklogs": data.get("metadata", {}).get("count", 0),
            }
