"""
Link codes per collegamento Telegram, condivisi via Redis.

I codici hanno TTL di 5 minuti.
"""

import secrets
import redis

from app.core.config import settings

_redis_url = settings.REDIS_URL.replace("+asyncpg", "")
_r = redis.from_url(_redis_url)

PREFIX = "link_code:"
TTL = 300  # 5 minuti


def generate_code(user_id: int) -> str:
    code = secrets.token_hex(4)
    _r.setex(f"{PREFIX}{code}", TTL, str(user_id))
    return code


def consume_code(code: str) -> int | None:
    key = f"{PREFIX}{code}"
    val = _r.get(key)
    if val is None:
        return None
    _r.delete(key)
    return int(val)
