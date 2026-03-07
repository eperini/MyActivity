"""
Endpoint per il bot Telegram.

Flusso di collegamento utente:
1. L'utente chiama POST /api/telegram/link -> riceve un codice univoco
2. L'utente manda /start <codice> al bot su Telegram
3. Il webhook riceve il messaggio, associa il chat_id all'utente
4. Da quel momento l'utente riceve le notifiche su Telegram
"""

import html
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.services.telegram_service import send_message, get_bot_info

router = APIRouter()

# Codici di collegamento temporanei: {codice: user_id}
_link_codes: dict[str, int] = {}


class LinkResponse(BaseModel):
    code: str
    bot_username: str
    instructions: str


@router.post("/link", response_model=LinkResponse)
async def generate_link_code(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Genera un codice per collegare l'account Telegram."""
    code = secrets.token_hex(4)  # 8 caratteri
    _link_codes[code] = user.id

    bot_info = await get_bot_info()
    bot_username = bot_info["username"] if bot_info else "myactivity_bot"

    return LinkResponse(
        code=code,
        bot_username=bot_username,
        instructions=f"Apri Telegram, cerca @{bot_username} e manda: /start {code}",
    )


@router.get("/status")
async def telegram_status(
    user: User = Depends(get_current_user),
):
    """Verifica se l'utente ha collegato Telegram."""
    return {
        "linked": user.telegram_chat_id is not None,
        "chat_id": user.telegram_chat_id,
    }


@router.delete("/unlink")
async def unlink_telegram(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Scollega Telegram dall'account."""
    user.telegram_chat_id = None
    await db.commit()
    return {"detail": "Telegram scollegato"}


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Riceve gli aggiornamenti dal bot Telegram.
    Gestisce i comandi: /start, /tasks, /done
    """
    data = await request.json()
    message = data.get("message")
    if not message:
        return {"ok": True}

    chat_id = message["chat"]["id"]
    text = message.get("text", "").strip()
    first_name = message["chat"].get("first_name", "")

    # /start <codice> -> collega l'account
    if text.startswith("/start"):
        parts = text.split()
        if len(parts) == 2:
            code = parts[1]
            user_id = _link_codes.pop(code, None)
            if user_id:
                user = await db.get(User, user_id)
                if user:
                    user.telegram_chat_id = chat_id
                    await db.commit()
                    await send_message(
                        chat_id,
                        f"Ciao <b>{html.escape(user.display_name)}</b>! Account collegato con successo.\n\n"
                        f"Comandi disponibili:\n"
                        f"/tasks - Mostra i task di oggi\n"
                        f"/help - Aiuto",
                    )
                    return {"ok": True}
            await send_message(chat_id, "Codice non valido o scaduto. Genera un nuovo codice dall'app.")
            return {"ok": True}

        # /start senza codice
        await send_message(
            chat_id,
            f"Ciao {first_name}! Per collegare il tuo account, genera un codice dall'app "
            f"e mandami: /start <codice>",
        )
        return {"ok": True}

    # Trova l'utente dal chat_id
    result = await db.execute(select(User).where(User.telegram_chat_id == chat_id))
    user = result.scalar_one_or_none()

    if not user:
        await send_message(chat_id, "Account non collegato. Usa /start <codice> per collegare.")
        return {"ok": True}

    # /tasks -> mostra task di oggi
    if text.startswith("/tasks"):
        from app.models.task import Task, TaskStatus
        from app.models.recurrence import TaskInstance
        from datetime import date

        today = date.today()

        # Task normali in scadenza oggi
        result = await db.execute(
            select(Task).where(
                Task.assigned_to == user.id,
                Task.due_date == today,
                Task.status != TaskStatus.DONE,
            )
        )
        tasks = result.scalars().all()

        # Anche task creati dall'utente senza assegnazione
        result = await db.execute(
            select(Task).where(
                Task.created_by == user.id,
                Task.assigned_to.is_(None),
                Task.due_date == today,
                Task.status != TaskStatus.DONE,
            )
        )
        own_tasks = result.scalars().all()
        all_tasks = {t.id: t for t in [*tasks, *own_tasks]}

        # Istanze ricorrenti di oggi
        from datetime import datetime as dt
        today_start = dt.combine(today, dt.min.time(), tzinfo=timezone.utc)
        today_end = dt.combine(today + __import__('datetime').timedelta(days=1), dt.min.time(), tzinfo=timezone.utc)

        result = await db.execute(
            select(TaskInstance).where(
                TaskInstance.due_date >= today_start,
                TaskInstance.due_date < today_end,
                TaskInstance.status == "todo",
            )
        )
        instances = result.scalars().all()

        if not all_tasks and not instances:
            await send_message(chat_id, "Nessun task per oggi! Giornata libera.")
            return {"ok": True}

        lines = ["<b>Task di oggi:</b>\n"]
        priority_emoji = {1: "🔴", 2: "🟠", 3: "🟡", 4: "⚪"}

        for t in all_tasks.values():
            p = priority_emoji.get(t.priority, "⚪")
            lines.append(f"{p} {html.escape(t.title)}")

        for inst in instances:
            task = await db.get(Task, inst.task_id)
            if task:
                lines.append(f"🔁 {html.escape(task.title)} (ricorrente)")

        await send_message(chat_id, "\n".join(lines))
        return {"ok": True}

    # /help
    if text.startswith("/help"):
        await send_message(
            chat_id,
            "<b>MyActivity Bot</b>\n\n"
            "/tasks - Mostra i task di oggi\n"
            "/help - Mostra questo messaggio",
        )
        return {"ok": True}

    # Messaggio non riconosciuto
    await send_message(chat_id, "Non ho capito. Prova /help per i comandi disponibili.")
    return {"ok": True}
