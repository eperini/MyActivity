"""
Bot Telegram interattivo per MyActivity.

Comandi:
  /start <codice>  - Collega l'account
  /tasks            - Task di oggi con bottoni per completarli
  /add <titolo>     - Aggiungi task veloce alla prima lista
  /habits           - Abitudini di oggi con toggle
  /summary          - Riepilogo giornaliero
  /help             - Mostra comandi

Gira come servizio separato in polling mode.
"""

import html
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import create_engine, select, func, and_
from sqlalchemy.orm import Session, sessionmaker
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters,
)

from app.core.config import settings
from app.core.link_codes import consume_code
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.task_list import TaskList
from app.models.habit import Habit, HabitLog

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Sync DB (same as celery workers)
SYNC_DB_URL = settings.DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(SYNC_DB_URL, echo=False)
SessionLocal = sessionmaker(engine)

PRIORITY_EMOJI = {1: "🔴", 2: "🟠", 3: "🟡", 4: "⚪"}


def get_user_by_chat_id(db: Session, chat_id: int) -> User | None:
    return db.execute(
        select(User).where(User.telegram_chat_id == chat_id)
    ).scalar_one_or_none()


def require_user(func):
    """Decorator: requires linked Telegram account."""
    async def wrapper(update: Update, context):
        with SessionLocal() as db:
            user = get_user_by_chat_id(db, update.effective_chat.id)
            if not user:
                await update.message.reply_text(
                    "Account non collegato. Collega dall'app e manda /start codice"
                )
                return
            context.user_data["user_id"] = user.id
            context.user_data["user_name"] = user.display_name
        return await func(update, context)
    return wrapper


# ─── /start ────────────────────────────────────────────

async def cmd_start(update: Update, context):
    chat_id = update.effective_chat.id
    args = context.args

    if args and len(args) == 1:
        code = args[0]
        user_id = consume_code(code)
        if user_id:
            with SessionLocal() as db:
                user = db.get(User, user_id)
                if user:
                    user.telegram_chat_id = chat_id
                    db.commit()
                    await update.message.reply_html(
                        f"Ciao <b>{html.escape(user.display_name)}</b>! Account collegato.\n\n"
                        f"Prova /tasks o /help per i comandi."
                    )
                    return
        await update.message.reply_text("Codice non valido o scaduto.")
        return

    first_name = update.effective_chat.first_name or ""
    await update.message.reply_html(
        f"Ciao <b>{html.escape(first_name)}</b>!\n\n"
        f"Per collegare il tuo account, genera un codice dall'app "
        f"e manda: /start &lt;codice&gt;"
    )


# ─── /tasks ────────────────────────────────────────────

@require_user
async def cmd_tasks(update: Update, context):
    user_id = context.user_data["user_id"]
    today = date.today()

    with SessionLocal() as db:
        tasks = db.execute(
            select(Task).where(
                Task.created_by == user_id,
                Task.status != TaskStatus.DONE,
                Task.due_date <= today,
            ).order_by(Task.priority, Task.due_date)
        ).scalars().all()

        if not tasks:
            await update.message.reply_text("Nessun task in scadenza! 🎉")
            return

        keyboard = []
        lines = ["<b>📋 Task di oggi:</b>\n"]

        for t in tasks:
            p = PRIORITY_EMOJI.get(t.priority, "⚪")
            overdue = "⏰ " if t.due_date < today else ""
            lines.append(f"{p} {overdue}{html.escape(t.title)}")
            keyboard.append([
                InlineKeyboardButton(
                    f"✅ {t.title[:30]}",
                    callback_data=f"done:{t.id}",
                )
            ])

        await update.message.reply_html(
            "\n".join(lines),
            reply_markup=InlineKeyboardMarkup(keyboard),
        )


# ─── /add ──────────────────────────────────────────────

@require_user
async def cmd_add(update: Update, context):
    user_id = context.user_data["user_id"]

    if not context.args:
        await update.message.reply_text("Uso: /add titolo del task")
        return

    title = " ".join(context.args)

    with SessionLocal() as db:
        # Prima lista dell'utente
        first_list = db.execute(
            select(TaskList).where(TaskList.owner_id == user_id).order_by(TaskList.id)
        ).scalars().first()

        if not first_list:
            await update.message.reply_text("Nessuna lista trovata. Crea una lista dall'app.")
            return

        task = Task(
            title=title,
            list_id=first_list.id,
            created_by=user_id,
            priority=4,
            status=TaskStatus.TODO,
            due_date=date.today(),
        )
        db.add(task)
        db.commit()

        await update.message.reply_html(
            f"✅ Task creato:\n<b>{html.escape(title)}</b>\n"
            f"📁 {html.escape(first_list.name)} · 📅 Oggi"
        )


# ─── /habits ───────────────────────────────────────────

@require_user
async def cmd_habits(update: Update, context):
    user_id = context.user_data["user_id"]
    today = date.today()
    today_str = today.isoformat()

    with SessionLocal() as db:
        habits = db.execute(
            select(Habit).where(
                Habit.created_by == user_id,
                Habit.is_archived == False,
            ).order_by(Habit.position)
        ).scalars().all()

        if not habits:
            await update.message.reply_text("Nessuna abitudine configurata. Creale dall'app!")
            return

        # Get today's logs
        habit_ids = [h.id for h in habits]
        logs = db.execute(
            select(HabitLog.habit_id).where(
                HabitLog.habit_id.in_(habit_ids),
                HabitLog.log_date == today,
            )
        ).scalars().all()
        logged_ids = set(logs)

        lines = [f"<b>🎯 Abitudini di oggi ({today.strftime('%d/%m')}):</b>\n"]
        keyboard = []

        for h in habits:
            done = h.id in logged_ids
            icon = "✅" if done else "⬜"
            lines.append(f"{icon} {html.escape(h.name)}")

            btn_text = f"{'↩️ Annulla' if done else '✅ Fatto'} {h.name[:25]}"
            keyboard.append([
                InlineKeyboardButton(
                    btn_text,
                    callback_data=f"habit:{h.id}:{today_str}",
                )
            ])

        done_count = len(logged_ids)
        total = len(habits)
        lines.append(f"\n<b>{done_count}/{total}</b> completate")

        await update.message.reply_html(
            "\n".join(lines),
            reply_markup=InlineKeyboardMarkup(keyboard),
        )


# ─── /summary ─────────────────────────────────────────

@require_user
async def cmd_summary(update: Update, context):
    user_id = context.user_data["user_id"]
    today = date.today()

    with SessionLocal() as db:
        # Tasks
        total_tasks = db.execute(
            select(func.count(Task.id)).where(
                Task.created_by == user_id,
                Task.due_date == today,
            )
        ).scalar() or 0

        done_tasks = db.execute(
            select(func.count(Task.id)).where(
                Task.created_by == user_id,
                Task.due_date == today,
                Task.status == TaskStatus.DONE,
            )
        ).scalar() or 0

        overdue = db.execute(
            select(func.count(Task.id)).where(
                Task.created_by == user_id,
                Task.due_date < today,
                Task.status != TaskStatus.DONE,
            )
        ).scalar() or 0

        # Habits
        habits = db.execute(
            select(Habit).where(
                Habit.created_by == user_id,
                Habit.is_archived == False,
            )
        ).scalars().all()

        habit_ids = [h.id for h in habits]
        done_habits = 0
        if habit_ids:
            done_habits = db.execute(
                select(func.count(HabitLog.id)).where(
                    HabitLog.habit_id.in_(habit_ids),
                    HabitLog.log_date == today,
                )
            ).scalar() or 0

        total_habits = len(habits)

        name = context.user_data.get("user_name", "")
        lines = [
            f"<b>📊 Riepilogo di oggi</b> - {today.strftime('%d/%m/%Y')}\n",
            f"<b>📋 Task:</b> {done_tasks}/{total_tasks} completati",
        ]
        if overdue > 0:
            lines.append(f"⏰ <b>{overdue}</b> task in ritardo")

        lines.append(f"<b>🎯 Abitudini:</b> {done_habits}/{total_habits} completate")

        # Progress bar
        if total_tasks + total_habits > 0:
            total = done_tasks + done_habits
            target = total_tasks + total_habits
            pct = int(total / target * 100)
            filled = int(pct / 10)
            bar = "█" * filled + "░" * (10 - filled)
            lines.append(f"\n{bar} {pct}%")

        await update.message.reply_html("\n".join(lines))


# ─── /help ─────────────────────────────────────────────

async def cmd_help(update: Update, context):
    await update.message.reply_html(
        "<b>🤖 MyActivity Bot</b>\n\n"
        "/tasks - Task di oggi (con bottoni ✅)\n"
        "/add &lt;titolo&gt; - Aggiungi task veloce\n"
        "/habits - Abitudini di oggi (con toggle)\n"
        "/summary - Riepilogo giornaliero\n"
        "/help - Mostra questo messaggio\n\n"
        "<i>Tocca i bottoni per completare task e abitudini!</i>"
    )


# ─── Callback handlers (button presses) ───────────────

async def callback_done(update: Update, context):
    """Handle task completion button."""
    query = update.callback_query
    await query.answer()

    data = query.data  # "done:{task_id}"
    task_id = int(data.split(":")[1])

    with SessionLocal() as db:
        user = get_user_by_chat_id(db, query.from_user.id)
        if not user:
            await query.answer("Account non collegato", show_alert=True)
            return

        task = db.get(Task, task_id)
        if not task or task.created_by != user.id:
            await query.answer("Task non trovato", show_alert=True)
            return

        if task.status == TaskStatus.DONE:
            await query.answer("Gia completato!", show_alert=True)
            return

        task.status = TaskStatus.DONE
        task.completed_at = datetime.now(timezone.utc)
        db.commit()

    # Update message: strike through the completed task
    await query.answer("✅ Completato!")

    # Refresh the task list
    user_id = user.id
    today = date.today()

    with SessionLocal() as db:
        tasks = db.execute(
            select(Task).where(
                Task.created_by == user_id,
                Task.status != TaskStatus.DONE,
                Task.due_date <= today,
            ).order_by(Task.priority, Task.due_date)
        ).scalars().all()

        if not tasks:
            await query.edit_message_text("Tutti i task completati! 🎉")
            return

        keyboard = []
        lines = ["<b>📋 Task di oggi:</b>\n"]

        for t in tasks:
            p = PRIORITY_EMOJI.get(t.priority, "⚪")
            overdue = "⏰ " if t.due_date < today else ""
            lines.append(f"{p} {overdue}{html.escape(t.title)}")
            keyboard.append([
                InlineKeyboardButton(
                    f"✅ {t.title[:30]}",
                    callback_data=f"done:{t.id}",
                )
            ])

        await query.edit_message_text(
            "\n".join(lines),
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(keyboard),
        )


async def callback_habit(update: Update, context):
    """Handle habit toggle button."""
    query = update.callback_query
    await query.answer()

    # "habit:{habit_id}:{date_str}"
    parts = query.data.split(":")
    habit_id = int(parts[1])
    date_str = parts[2]
    log_date = date.fromisoformat(date_str)

    with SessionLocal() as db:
        user = get_user_by_chat_id(db, query.from_user.id)
        if not user:
            await query.answer("Account non collegato", show_alert=True)
            return

        habit = db.get(Habit, habit_id)
        if not habit or habit.created_by != user.id:
            await query.answer("Abitudine non trovata", show_alert=True)
            return

        # Toggle
        existing = db.execute(
            select(HabitLog).where(
                HabitLog.habit_id == habit_id,
                HabitLog.log_date == log_date,
            )
        ).scalar_one_or_none()

        if existing:
            db.delete(existing)
            toggled_to = False
        else:
            log = HabitLog(
                habit_id=habit_id,
                user_id=user.id,
                log_date=log_date,
            )
            db.add(log)
            toggled_to = True

        db.commit()

    status = "completata ✅" if toggled_to else "annullata ↩️"
    await query.answer(f"Abitudine {status}")

    # Refresh habit list
    user_id = user.id
    today = date.today()
    today_str = today.isoformat()

    with SessionLocal() as db:
        habits = db.execute(
            select(Habit).where(
                Habit.created_by == user_id,
                Habit.is_archived == False,
            ).order_by(Habit.position)
        ).scalars().all()

        habit_ids = [h.id for h in habits]
        logs = db.execute(
            select(HabitLog.habit_id).where(
                HabitLog.habit_id.in_(habit_ids),
                HabitLog.log_date == today,
            )
        ).scalars().all()
        logged_ids = set(logs)

        lines = [f"<b>🎯 Abitudini di oggi ({today.strftime('%d/%m')}):</b>\n"]
        keyboard = []

        for h in habits:
            done = h.id in logged_ids
            icon = "✅" if done else "⬜"
            lines.append(f"{icon} {html.escape(h.name)}")

            btn_text = f"{'↩️ Annulla' if done else '✅ Fatto'} {h.name[:25]}"
            keyboard.append([
                InlineKeyboardButton(
                    btn_text,
                    callback_data=f"habit:{h.id}:{today_str}",
                )
            ])

        done_count = len(logged_ids)
        total = len(habits)
        lines.append(f"\n<b>{done_count}/{total}</b> completate")

        await query.edit_message_text(
            "\n".join(lines),
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(keyboard),
        )


async def callback_router(update: Update, context):
    """Route callbacks to the right handler."""
    data = update.callback_query.data
    if data.startswith("done:"):
        await callback_done(update, context)
    elif data.startswith("habit:"):
        await callback_habit(update, context)


# ─── Unknown commands ──────────────────────────────────

async def unknown(update: Update, context):
    await update.message.reply_text(
        "Non ho capito. Prova /help per i comandi."
    )


# ─── Main ─────────────────────────────────────────────

def main():
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN not set")
        return

    app = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).build()

    # Commands
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("tasks", cmd_tasks))
    app.add_handler(CommandHandler("add", cmd_add))
    app.add_handler(CommandHandler("habits", cmd_habits))
    app.add_handler(CommandHandler("summary", cmd_summary))
    app.add_handler(CommandHandler("help", cmd_help))

    # Callback queries (button presses)
    app.add_handler(CallbackQueryHandler(callback_router))

    # Unknown
    app.add_handler(MessageHandler(filters.COMMAND, unknown))

    # Error handler
    async def error_handler(update, context):
        logger.error("Exception while handling an update:", exc_info=context.error)

    app.add_error_handler(error_handler)

    logger.info("Bot started in polling mode")
    app.run_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
