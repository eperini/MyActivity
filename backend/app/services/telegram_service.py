"""
Servizio Telegram Bot per Zeno.

Il bot gestisce:
- /start -> registra il chat_id dell'utente per ricevere notifiche
- /tasks -> mostra i task in scadenza oggi
- /done <id> -> segna un'istanza come completata
"""

import httpx
from app.core.config import settings

BOT_URL = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}"


async def send_message(chat_id: int, text: str, parse_mode: str = "HTML") -> bool:
    """Invia un messaggio Telegram."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return False
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BOT_URL}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode},
            )
            return resp.status_code == 200
    except Exception:
        return False


def send_message_sync(chat_id: int, text: str, parse_mode: str = "HTML") -> bool:
    """Versione sincrona per i worker Celery."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return False
    try:
        resp = httpx.post(
            f"{BOT_URL}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode},
        )
        return resp.status_code == 200
    except Exception:
        return False


async def set_webhook(webhook_url: str) -> bool:
    """Imposta il webhook per ricevere aggiornamenti dal bot."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BOT_URL}/setWebhook",
                json={"url": webhook_url},
            )
            return resp.status_code == 200
    except Exception:
        return False


async def delete_webhook() -> bool:
    """Rimuove il webhook (per usare polling)."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{BOT_URL}/deleteWebhook")
            return resp.status_code == 200
    except Exception:
        return False


async def get_bot_info() -> dict | None:
    """Informazioni sul bot."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{BOT_URL}/getMe")
            if resp.status_code == 200:
                return resp.json().get("result")
    except Exception:
        return None
