"""Tempo Cloud API client — async + sync versions."""
from __future__ import annotations

from datetime import date, timedelta

import httpx

from app.core.config import settings


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
