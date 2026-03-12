# myActivity - Documentazione Architetturale

## Panoramica

**myActivity** e' un'applicazione self-hosted per la gestione di task, abitudini e produttivita personale, ispirata a TickTick. Progettata per uso familiare multi-utente, gira interamente su un Mac Mini tramite Docker Desktop.

### Obiettivi principali
- Gestione task con ricorrenze avanzate (inclusi pattern lavorativi)
- Tracking abitudini con streak e statistiche
- Notifiche proattive via Telegram, Web Push e Email
- Matrice di Eisenhower per prioritizzazione visiva
- Kanban board con drag & drop per gestione stati
- Timer Pomodoro integrato con storico sessioni
- Subtask con progress bar e template riutilizzabili
- Google Calendar sync bidirezionale
- Google Drive backup automatico
- Import da TickTick (CSV)
- Quick add con linguaggio naturale (italiano)
- iPhone Action Button via iOS Shortcuts
- Interfaccia in italiano con tema scuro

---

## Stack Tecnologico

### Backend
| Componente | Tecnologia | Versione | Motivazione |
|---|---|---|---|
| Framework API | FastAPI | 0.115.6 | Async nativo, auto-documentazione OpenAPI, validazione Pydantic |
| Database | PostgreSQL | 16 (Alpine) | ACID, supporto ARRAY nativo per `frequency_days`, robustezza |
| ORM | SQLAlchemy | 2.0.36 | Async con `asyncpg`, mapped columns, relationship resolution |
| Migrazioni | Alembic | 1.14.0 | Integrazione SQLAlchemy, autogenerate |
| Cache/Broker | Redis | 7 (Alpine) | Broker Celery, veloce, persistenza opzionale |
| Task Queue | Celery | 5.4.0 | Beat scheduler per notifiche, istanze ricorrenti, report, backup |
| Autenticazione | PyJWT + bcrypt | - | JWT in HttpOnly cookie, bcrypt diretto, API key per shortcuts |
| Rate Limiting | slowapi | 0.1.9 | Protezione brute-force su auth endpoints |
| Ricorrenze | python-dateutil | 2.9.0 | Parsing RRULE RFC 5545, calcolo occorrenze |
| Notifiche | httpx + pywebpush | - | Telegram Bot API, Web Push VAPID, Email SMTP |
| Google | google-api-python-client | - | Calendar sync, Drive backup |

### Frontend
| Componente | Tecnologia | Versione | Motivazione |
|---|---|---|---|
| Framework | Next.js | 16.1.6 | App Router, Turbopack, SSR/CSR flessibile |
| UI | React | 19.2.3 | Componenti funzionali, hooks |
| Styling | Tailwind CSS | 4.x | Utility-first, tema scuro nativo, nessun CSS custom |
| Icone | lucide-react | 0.577.0 | Set completo, tree-shakable, coerente |
| Date | date-fns | 4.1.0 | Immutabile, locale italiano, tree-shakable |
| Linguaggio | TypeScript | 5.x | Type safety, IDE support |

### Infrastruttura
| Componente | Tecnologia | Motivazione |
|---|---|---|
| Orchestrazione | Docker Compose | 6 servizi, un solo comando per avviare tutto |
| Host | Mac Mini | Self-hosted, sempre acceso, Docker Desktop |
| Accesso remoto | Tailscale | VPN mesh per accesso da iPhone/altri dispositivi |
| Variabili | .env | Secrets fuori dal codice, gitignored |
| Container | Multi-stage, non-root | Sicurezza e dimensioni immagine ridotte |

---

## Architettura dei Servizi

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend   │────▶│Google Calendar│
│  Next.js     │:3000│   FastAPI   │:8000│Google Drive   │
│  (produzione)│     │  (uvicorn)  │     └──────────────┘
└─────────────┘     └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌───────────┐ ┌─────────┐ ┌──────────┐
       │ PostgreSQL │ │  Redis  │ │ Telegram │
       │  (interno) │ │(interno)│ │ Bot API  │
       └───────────┘ └────┬────┘ └──────────┘
                          │
              ┌───────────┼───────────┐
              ▼                       ▼
       ┌──────────────┐    ┌──────────────┐
       │ Celery Worker │    │ Celery Beat  │
       │ (notifiche,   │    │ (scheduler   │
       │  istanze,     │    │  periodico)  │
       │  report,      │    │              │
       │  backup)      │    │              │
       └──────────────┘    └──────────────┘
              │
       ┌──────────────┐
       │ Telegram Bot │
       │  (polling)   │
       └──────────────┘
```

### Docker Compose - 6 servizi

1. **db** - PostgreSQL 16 Alpine, volume persistente, rete `internal`
2. **redis** - Redis 7 Alpine, volume `redis_data`, rete `internal`
3. **backend** - FastAPI con uvicorn, porta 8000 esposta, reti `internal` + `frontend`
4. **celery-worker** - Stesso container del backend, comando `celery worker`, rete `internal`
5. **celery-beat** - Stesso container, comando `celery beat`, rete `internal`
6. **telegram-bot** - Bot Telegram in polling, rete `internal`

**Network segmentation**: DB e Redis sono raggiungibili solo dalla rete `internal`. Solo il backend e' esposto sulla rete `frontend` (porta 8000).

---

## Struttura del Progetto

```
myActivity/
├── .env                          # Secrets (gitignored)
├── .env.example                  # Template variabili
├── docker-compose.yml
├── ARCHITECTURE.md               # Questo documento
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── migrations/
│   │   ├── env.py                # Async migration runner
│   │   └── versions/
│   └── app/
│       ├── main.py               # FastAPI app, CORS, rate limiting, router registration
│       ├── core/
│       │   ├── config.py         # Pydantic Settings (env vars)
│       │   ├── database.py       # Async engine, sessionmaker, Base
│       │   ├── security.py       # bcrypt hash/verify, PyJWT encode/decode
│       │   ├── limiter.py        # slowapi rate limiter instance
│       │   └── deps.py           # get_current_user (JWT cookie + Bearer + API key)
│       ├── models/
│       │   ├── __init__.py       # Import ALL models (relationship resolution)
│       │   ├── user.py           # User (email, telegram_chat_id, api_key, is_admin)
│       │   ├── task_list.py      # TaskList (position) + ListMember (roles)
│       │   ├── task.py           # Task (priority 1-4, status enum, parent_id)
│       │   ├── recurrence.py     # RecurrenceRule + TaskInstance
│       │   ├── notification.py   # Notification (channel, offset)
│       │   ├── habit.py          # Habit + HabitLog
│       │   ├── pomodoro.py       # PomodoroSession
│       │   ├── push.py           # PushSubscription (VAPID)
│       │   ├── tag.py            # Tag + task_tags association
│       │   ├── comment.py        # Comment
│       │   └── template.py       # TaskTemplate (JSON subtasks/recurrence)
│       ├── api/routes/
│       │   ├── auth.py           # Register, login, logout, profile, API key
│       │   ├── lists.py          # CRUD liste + reorder + members
│       │   ├── tasks.py          # CRUD task + subtasks + enrichment
│       │   ├── recurrences.py    # Set/get/delete ricorrenza
│       │   ├── habits.py         # CRUD abitudini, toggle, logs, stats
│       │   ├── pomodoro.py       # Sessioni pomodoro + stats
│       │   ├── telegram.py       # Webhook, link/unlink
│       │   ├── push.py           # VAPID key, subscribe/unsubscribe, test
│       │   ├── export.py         # Export JSON/CSV + import JSON + import TickTick
│       │   ├── stats.py          # Dashboard statistiche
│       │   ├── google_calendar.py # Config + sync manuale
│       │   ├── backup.py         # Trigger manuale + list backups (admin only)
│       │   ├── tags.py           # CRUD tag + add/remove da task
│       │   ├── comments.py       # CRUD commenti su task
│       │   ├── quickadd.py       # Quick add con linguaggio naturale
│       │   ├── shortcut.py       # API key endpoint per iOS Shortcuts
│       │   └── templates.py      # CRUD template + from-task + instantiate
│       ├── services/
│       │   ├── recurrence_service.py  # RRULE builder, occorrenze, workday adjust
│       │   ├── telegram_service.py    # send_message async/sync
│       │   ├── google_calendar.py     # Push/pull/delete eventi
│       │   ├── google_drive.py        # Upload backup + rotazione
│       │   ├── email_service.py       # SMTP Gmail per report
│       │   └── quickadd_parser.py     # Parser italiano (regex-based)
│       └── workers/
│           ├── celery_app.py     # Celery config, beat schedule
│           └── tasks.py          # Istanze ricorrenti, notifiche, report, backup
│
└── frontend/
    ├── package.json
    ├── next.config.ts
    ├── tsconfig.json
    ├── public/
    │   ├── manifest.json         # PWA manifest
    │   └── sw.js                 # Service worker per push notifications
    └── src/
        ├── app/
        │   ├── layout.tsx        # Geist font, dark theme, lang="it", Providers
        │   ├── globals.css       # Tailwind, thin scrollbars
        │   ├── page.tsx          # Dashboard principale (routing viste)
        │   └── login/page.tsx    # Login/Register form
        ├── components/
        │   ├── Sidebar.tsx       # Navigazione + liste + drag & drop reorder
        │   ├── TaskListView.tsx  # Lista task filtrata + ordinamento
        │   ├── TaskItem.tsx      # Riga task (checkbox, badge, date, subtask progress)
        │   ├── TaskDetail.tsx    # Pannello dettaglio (edit, subtask, tag, commenti, template)
        │   ├── AddTaskForm.tsx   # Creazione task (structured + quick + template)
        │   ├── DatePicker.tsx    # Calendario popup (shortcuts + griglia + orario)
        │   ├── DayCalendar.tsx   # Vista giornaliera con timeline
        │   ├── CalendarView.tsx  # Calendario mensile con task
        │   ├── KanbanView.tsx    # Board 3 colonne con drag & drop
        │   ├── EisenhowerMatrix.tsx # Matrice 2x2 priorita
        │   ├── HabitListView.tsx # Lista abitudini con week strip
        │   ├── HabitDetail.tsx   # Dettaglio abitudine (stats + calendario mensile)
        │   ├── AddHabitForm.tsx  # Modal creazione abitudine
        │   ├── PomodoroTimer.tsx # Timer circolare SVG
        │   ├── PomodoroHistory.tsx # Stats + cronologia sessioni
        │   ├── ShareListModal.tsx # Condivisione lista con membri
        │   ├── StatsView.tsx     # Dashboard statistiche
        │   ├── SettingsView.tsx  # Tutte le impostazioni
        │   ├── Toast.tsx         # ToastProvider context, auto-dismiss 4s
        │   ├── BottomTabBar.tsx  # Tab bar mobile (5 tab con ciclo "More")
        │   ├── MobileHeader.tsx  # Header mobile con hamburger
        │   └── FloatingAddButton.tsx # FAB mobile
        ├── hooks/
        │   └── useIsMobile.ts    # Breakpoint md (768px)
        ├── lib/
        │   ├── api.ts            # Client HTTP con cookie auth, 401 guard
        │   └── dates.ts          # formatRelativeDate, isOverdue
        └── types/
            └── index.ts          # Interfacce TypeScript
```

---

## Decisioni Architetturali

### 1. Async FastAPI + Sync Celery Workers

**Problema**: Celery usa il proprio event loop e non puo' usare `asyncpg`.

**Soluzione**: Il backend FastAPI usa `asyncpg` (async) per le API HTTP, mentre i Celery workers usano `psycopg2` (sincrono) con un engine separato. L'URL viene convertito automaticamente:
```python
SYNC_DB_URL = settings.DATABASE_URL.replace("+asyncpg", "")
```

### 2. bcrypt diretto (non passlib)

**Problema**: `passlib` con bcrypt 5.x genera `ValueError: password cannot be longer than 72 bytes`.

**Soluzione**: Uso diretto di `bcrypt.hashpw()` e `bcrypt.checkpw()` in `security.py`, bypassando completamente passlib. JWT gestiti con `PyJWT`.

### 3. JWT in HttpOnly Cookie

**Decisione**: Il JWT viene salvato in un cookie HttpOnly (SameSite=Lax) invece che in localStorage.

**Motivazione**: Protegge da XSS (JavaScript non puo' leggere il token). Il backend supporta dual auth: sia cookie che header Bearer per compatibilita' con API key e testing.

### 4. Enrichment pattern per Task

**Problema**: SQLAlchemy async causa `MissingGreenlet` se Pydantic tenta di serializzare relationship lazy-loaded.

**Soluzione**: La funzione `_enrich_with_recurrence()` carica in batch: ricorrenze, tag, assigned_to_name, subtask_count/subtask_done_count. Tutti gli endpoint che restituiscono Task passano per questa funzione.

### 5. List access check (owner O membro)

**Decisione**: `_check_list_access()` verifica che l'utente sia owner della lista O membro con ruolo edit/view.

**Motivazione**: Permette ai membri di una lista condivisa di creare, modificare e eliminare task nella lista senza essere owner.

### 6. RRULE RFC 5545 + Workday Adjustment

**Soluzione**: Due livelli:
1. **RRULE standard** tramite `python-dateutil` per frequenze base
2. **Post-processing custom** (`adjust_to_workday()`) che sposta la data al giorno lavorativo target

### 7. Priorita come Eisenhower Quadrants

| Priorita | Valore | Colore | Quadrante Eisenhower |
|---|---|---|---|
| Urgente | 1 | Rosso | Urgente & Importante |
| Alta | 2 | Arancione | Non Urgente & Importante |
| Media | 3 | Giallo | Urgente & Non Importante |
| Bassa | 4 | Grigio | Non Urgente & Non Importante |

### 8. Route ordering FastAPI

**Regola**: Le route statiche (`/reorder`, `/reset-order`) devono essere definite PRIMA delle route parametriche (`/{list_id}`) per evitare che FastAPI matchi "reorder" come parametro intero.

### 9. Ordinamento liste: manuale + automatico

**Logica**: Se almeno una lista ha `position > 0`, tutte le liste vengono ordinate per position (manuale). Altrimenti, vengono ordinate per numero di task (decrescente, automatico). Il reset azzera tutte le position a 0.

### 10. Task defaults

- **Data**: default a "oggi" alla creazione
- **Assegnazione**: auto-assegnato al creatore se non specificato
- **Ordinamento**: per data in tutte le viste lista
- **Vista Oggi/Prossimi 7gg**: include task scaduti (overdue)

---

## Sicurezza

### Autenticazione e Autorizzazione
- **JWT** in HttpOnly cookie, durata 24h, SameSite=Lax
- **Dual auth**: cookie + Bearer header + API key (X-API-Key)
- **bcrypt** per hashing password (diretto, min 8 char, max 128 char)
- **API key** hashata con SHA-256 nel DB per iOS Shortcuts
- **List access check**: owner O membro su tutte le operazioni task
- **IDOR fix**: comments, tags, push subscription verificano accesso
- **Rate limiting**: `slowapi` 5 req/min su `/auth/login` e `/auth/register`
- **Backup**: solo admin (is_admin check)

### Validazione Input
- **Title**: max 500 char
- **Description**: max 5000 char
- **Comment**: max 5000 char
- **Quick add**: max 500 char
- **Priority**: `Field(ge=1, le=4)`
- **Tag color**: regex `^#[0-9a-fA-F]{6}$`
- **Member role**: pattern `^(edit|view)$`

### Infrastruttura
- **CORS** limitato, metodi e header specifici
- **`.env`** con secrets escluso dal git, SECRET_KEY obbligatorio (startup check)
- **PostgreSQL e Redis non esposti** sull'host (solo rete Docker interna)
- **Container non-root**: utente `app` dedicato
- **HTML escape** nei messaggi Telegram e email report
- **Toast feedback**: tutte le operazioni mostrano errori all'utente

---

## Modello Dati

### Users
```
users
├── id (PK)
├── email (UNIQUE)
├── hashed_password
├── display_name
├── telegram_chat_id (BIGINT, nullable)
├── is_admin (BOOLEAN)
├── api_key_hash (nullable, SHA-256)
├── daily_report_email (BOOLEAN)
├── daily_report_push (BOOLEAN)
└── daily_report_time (TIME, nullable)
```

### Task Management
```
lists                          tasks
├── id (PK)                    ├── id (PK)
├── name                       ├── title
├── color                      ├── description
├── icon                       ├── list_id (FK -> lists, CASCADE)
├── owner_id (FK -> users)     ├── created_by (FK -> users)
├── position (INT, default 0)  ├── assigned_to (FK -> users, nullable)
├── created_at                 ├── priority (1-4)
│                              ├── status (todo/doing/done)
list_members                   ├── due_date
├── id (PK)                    ├── due_time
├── list_id (FK, CASCADE)      ├── completed_at
├── user_id (FK, CASCADE)      ├── parent_id (self-ref FK, CASCADE)
└── role (edit/view)           ├── google_event_id (nullable)
                               ├── position (INT)
                               ├── created_at
                               └── updated_at
```

### Tags & Commenti
```
tags                           task_tags (association)
├── id (PK)                    ├── task_id (FK)
├── name                       └── tag_id (FK)
├── color (#hex)
└── user_id (FK -> users)      comments
                               ├── id (PK)
                               ├── task_id (FK)
                               ├── user_id (FK)
                               ├── text
                               └── created_at
```

### Ricorrenze
```
recurrence_rules               task_instances
├── id (PK)                    ├── id (PK)
├── task_id (FK, UNIQUE)       ├── task_id (FK)
├── rrule (TEXT)               ├── due_date
├── workday_adjust (ENUM)      ├── status (todo/done/skip)
├── workday_target (INT)       ├── completed_at
└── next_occurrence            └── completed_by (FK)
```

### Abitudini
```
habits                         habit_logs
├── id (PK)                    ├── id (PK)
├── name                       ├── habit_id (FK)
├── description                ├── user_id (FK)
├── list_id (FK, nullable)     ├── log_date (DATE)
├── created_by (FK)            ├── value (FLOAT)
├── frequency_type             └── note
├── frequency_days (ARRAY)
├── times_per_period
├── time_of_day
├── start_date / end_date
├── color / icon
├── position
└── is_archived
```

### Template, Pomodoro, Notifiche, Push
```
task_templates                 pomodoro_sessions
├── id (PK)                    ├── id (PK)
├── user_id (FK)               ├── user_id (FK)
├── name                       ├── task_id (FK, nullable)
├── title                      ├── started_at / ended_at
├── description                ├── duration_minutes
├── priority                   └── session_type
├── subtask_titles (JSON)
└── recurrence_config (JSON)   push_subscriptions
                               ├── id (PK)
notifications                  ├── user_id (FK)
├── id (PK)                    ├── endpoint
├── user_id / task_id          ├── p256dh
├── channel                    └── auth
├── offset_minutes
└── sent_at
```

### DB Indexes
- `tasks`: list_id, created_by, assigned_to, status, due_date, parent_id
- `notifications`: task_id, user_id, sent_at
- `comments`: task_id

---

## API Endpoints

### Autenticazione (rate limited: 5/min)
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/auth/register` | Registrazione utente |
| POST | `/api/auth/login` | Login, setta JWT cookie |
| POST | `/api/auth/logout` | Logout, cancella cookie |
| GET | `/api/auth/me` | Profilo utente |
| PATCH | `/api/auth/me/preferences` | Aggiorna preferenze report |
| POST | `/api/auth/me/api-key` | Genera API key |
| DELETE | `/api/auth/me/api-key` | Revoca API key |

### Liste
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/lists/` | Liste utente (proprie + condivise), ordinate |
| POST | `/api/lists/` | Crea lista |
| PATCH | `/api/lists/reorder` | Salva ordine manuale |
| PATCH | `/api/lists/reset-order` | Reset a ordine automatico |
| PATCH | `/api/lists/{id}` | Aggiorna lista |
| DELETE | `/api/lists/{id}` | Elimina lista + task |
| GET | `/api/lists/{id}/members` | Membri della lista |
| POST | `/api/lists/{id}/members` | Aggiungi membro |
| PATCH | `/api/lists/{id}/members/{mid}` | Aggiorna ruolo |
| DELETE | `/api/lists/{id}/members/{mid}` | Rimuovi membro |

### Task (con list access check)
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/tasks/` | Task con filtri (list_id, status, tag_id) |
| POST | `/api/tasks/` | Crea task (auto-assign, default oggi) |
| PATCH | `/api/tasks/{id}` | Aggiorna task (incluso cambio lista) |
| DELETE | `/api/tasks/{id}` | Elimina task |
| GET | `/api/tasks/{id}/subtasks` | Subtask di un task |
| POST | `/api/tasks/{id}/subtasks` | Crea subtask |
| PATCH | `/api/tasks/{id}/subtasks/{sid}/toggle` | Toggle subtask done/todo |
| PATCH | `/api/tasks/{id}/subtasks/reorder` | Riordina subtask |

### Ricorrenze
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/tasks/{id}/recurrence` | Imposta ricorrenza (RRULE) |
| GET | `/api/tasks/{id}/recurrence` | Dettaglio ricorrenza |
| DELETE | `/api/tasks/{id}/recurrence` | Rimuovi ricorrenza |
| GET | `/api/tasks/{id}/recurrence/preview` | Anteprima prossime N date |
| GET | `/api/tasks/{id}/instances` | Istanze generate |

### Tags
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/tags/` | Tutti i tag utente |
| POST | `/api/tags/` | Crea tag |
| PATCH | `/api/tags/{id}` | Aggiorna tag |
| DELETE | `/api/tags/{id}` | Elimina tag |
| POST | `/api/tags/tasks/{tid}/tags/{tag_id}` | Aggiungi tag a task |
| DELETE | `/api/tags/tasks/{tid}/tags/{tag_id}` | Rimuovi tag da task |

### Commenti
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/tasks/{id}/comments` | Commenti di un task |
| POST | `/api/tasks/{id}/comments` | Aggiungi commento |
| DELETE | `/api/tasks/{id}/comments/{cid}` | Elimina commento |

### Template
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/templates/` | Tutti i template |
| POST | `/api/templates/from-task/{id}` | Crea template da task esistente |
| POST | `/api/templates/{id}/instantiate` | Crea task da template |
| DELETE | `/api/templates/{id}` | Elimina template |

### Abitudini
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/habits/` | Tutte le abitudini attive |
| POST | `/api/habits/` | Crea abitudine |
| PATCH | `/api/habits/{id}` | Modifica abitudine |
| DELETE | `/api/habits/{id}` | Elimina abitudine |
| POST | `/api/habits/{id}/toggle` | Toggle check-in per data |
| GET | `/api/habits/{id}/logs` | Log mensili |
| GET | `/api/habits/{id}/stats` | Statistiche (streak, rate) |
| GET | `/api/habits/logs/week` | Log settimanali tutte le abitudini |

### Pomodoro
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/pomodoro/` | Registra sessione |
| GET | `/api/pomodoro/` | Ultime 100 sessioni |
| GET | `/api/pomodoro/stats` | Stats (oggi + totali) |

### Quick Add & Shortcuts
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/tasks/quickadd` | Quick add linguaggio naturale (JWT) |
| POST | `/api/shortcut/task` | Quick add via API key (iOS Shortcuts) |

### Export/Import
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/export/tasks` | Export task JSON/CSV |
| GET | `/api/export/habits` | Export abitudini JSON/CSV |
| POST | `/api/export/import/tasks` | Import task da JSON |
| POST | `/api/export/import/ticktick` | Import da TickTick CSV backup |

### Notifiche & Push
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/push/vapid-key` | Chiave pubblica VAPID |
| POST | `/api/push/subscribe` | Registra push subscription |
| DELETE | `/api/push/subscribe` | Rimuovi push subscription |
| POST | `/api/push/test` | Invia notifica di test |

### Google Calendar
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/google/config` | Configurazione sync |
| POST | `/api/google/sync` | Sync manuale bidirezionale |

### Backup (admin only)
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/backup/trigger` | Avvia backup manuale |
| GET | `/api/backup/list` | Lista ultimi backup |

### Telegram
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/telegram/webhook` | Riceve messaggi dal bot |
| POST | `/api/telegram/link` | Genera codice di collegamento |
| DELETE | `/api/telegram/unlink` | Scollega account |
| GET | `/api/telegram/status` | Stato collegamento |

### Stats & Health
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/stats/dashboard` | Dashboard statistiche complete |
| GET | `/api/health` | Healthcheck |

---

## Viste Frontend

### 1. Oggi
Task con scadenza oggi + task scaduti (overdue). Ordinamento per data.

### 2. Prossimi 7 Giorni
Task con scadenza entro 7 giorni + task scaduti. Ordinamento per data.

### 3. Inbox
Tutti i task non completati. Ordinamento per data.

### 4. Vista per Lista
Task filtrati per `list_id`, con form di creazione inline.

### 5. Calendario
Vista mensile con task posizionati sui giorni. Click per creare task su data specifica.

### 6. Kanban Board
3 colonne (Todo, In Progress, Done) con drag & drop per cambiare stato. Filtro per lista. Card con priorita, data, tag, subtask progress.

### 7. Matrice di Eisenhower
Griglia 2x2 che mappa le 4 priorita. Ogni quadrante raggruppa i task per scadenza.

### 8. Abitudini
Lista abitudini con week strip (pallini cliccabili Lun-Dom). Dettaglio con statistiche e calendario mensile.

### 9. Pomodoro
Timer circolare SVG con progress ring (25/5/15 min). Pannello con statistiche e cronologia sessioni.

### 10. Statistiche
Dashboard con completion rate, weekly/monthly charts, habits overview, focus hours.

### 11. Impostazioni
Invito famiglia, Google Calendar, backup, push notifications, report giornaliero, export/import, import TickTick, template, API key, logout.

---

## Celery Beat - Task Periodici

| Task | Schedule | Funzione |
|---|---|---|
| `generate_recurring_instances` | Ogni giorno alle 00:05 | Genera TaskInstance per i prossimi 7 giorni |
| `check_and_send_notifications` | Ogni 60 secondi | Verifica e invia notifiche (Telegram + Push) |
| `send_daily_reports` | Ogni 5 minuti | Report giornaliero (email + push + Telegram) |
| `backup_to_drive` | Ogni giorno alle 03:00 | pg_dump + gzip + upload Google Drive |

Timezone: `Europe/Rome`

---

## Import TickTick

L'endpoint `POST /export/import/ticktick` accetta il CSV di backup di TickTick e importa:

- **Task** con titolo, descrizione, priorita mappata (TT 0→4, 1→1, 3→2, 5→3)
- **Liste** create automaticamente dal campo "List Name"
- **Subtask** collegati tramite parentId/taskId
- **Tag** creati automaticamente con colori ciclici
- **Ricorrenze** (campo Repeat in formato RRULE)
- **Stato** mappato (TT 0→todo, 1/2→done, colonna Kanban→doing)
- **Checklist** convertite (▫→[ ], ▪→[x])

Gestisce UTF-8 BOM e righe metadata iniziali del CSV TickTick.

---

## Come Avviare

```bash
# 1. Configura le variabili d'ambiente
cp .env.example .env
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"

# 2. Avvia i servizi Docker
docker compose up -d

# 3. Esegui le migrazioni
docker compose exec -w /app backend alembic upgrade head

# 4. Build e avvia il frontend (produzione)
cd frontend
npm install
npm run build
npm run start    # porta 3000

# L'app e' disponibile su http://localhost:3000
# Le API su http://localhost:8000/api
# Docs OpenAPI su http://localhost:8000/docs
```

---

## Sviluppi Futuri

- Integrazione Obsidian vault (daily note + report periodici)
- Widget iOS/Android
- Bot Telegram interattivo (polling o webhook avanzato)
