# myActivity - Documentazione Architetturale

## Panoramica

**myActivity** e' un'applicazione self-hosted per la gestione di task, abitudini e produttivita personale, ispirata a TickTick. Progettata per uso familiare multi-utente, gira interamente su un Mac Mini tramite Docker Desktop.

### Obiettivi principali
- Gestione task con ricorrenze avanzate (inclusi pattern lavorativi)
- Tracking abitudini con streak e statistiche
- Notifiche proattive via Telegram
- Matrice di Eisenhower per prioritizzazione visiva
- Timer Pomodoro integrato con storico sessioni
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
| Task Queue | Celery | 5.4.0 | Beat scheduler per notifiche e generazione istanze |
| Autenticazione | PyJWT + bcrypt | - | JWT stateless, bcrypt diretto |
| Rate Limiting | slowapi | 0.1.9 | Protezione brute-force su auth endpoints |
| Ricorrenze | python-dateutil | 2.9.0 | Parsing RRULE RFC 5545, calcolo occorrenze |
| Notifiche | httpx | 0.28.1 | Chiamate HTTP async a Telegram Bot API |

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
| Orchestrazione | Docker Compose | 5 servizi, un solo comando per avviare tutto |
| Host | Mac Mini | Self-hosted, sempre acceso, Docker Desktop |
| Variabili | .env | Secrets fuori dal codice, gitignored |
| Container | Multi-stage, non-root | Sicurezza e dimensioni immagine ridotte |

---

## Architettura dei Servizi

```
┌─────────────┐     ┌─────────────┐
│   Frontend   │────▶│   Backend   │
│  Next.js     │:3000│   FastAPI   │:8000
│  (dev mode)  │     │  (uvicorn)  │
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
       │  istanze)     │    │  periodico)  │
       └──────────────┘    └──────────────┘
```

### Docker Compose - 5 servizi + 2 reti

1. **db** - PostgreSQL 16 Alpine, volume persistente, rete `internal` (non esposto sull'host)
2. **redis** - Redis 7 Alpine, volume `redis_data`, rete `internal` (non esposto sull'host)
3. **backend** - FastAPI con uvicorn, porta 8000 esposta, reti `internal` + `frontend`
4. **celery-worker** - Stesso container del backend, comando `celery worker`, rete `internal`
5. **celery-beat** - Stesso container, comando `celery beat`, rete `internal`

**Network segmentation**: DB e Redis sono raggiungibili solo dalla rete `internal`. Solo il backend e' esposto sulla rete `frontend` (porta 8000). Questo impedisce accessi diretti ai servizi dati dall'esterno.

Tutti i servizi backend condividono le stesse variabili d'ambiente (DATABASE_URL, REDIS_URL, SECRET_KEY, TELEGRAM_BOT_TOKEN) iniettate dal file `.env`.

---

## Struttura del Progetto

```
myActivity/
├── .env                          # Secrets (gitignored)
├── .env.example                  # Template variabili
├── .gitignore
├── docker-compose.yml
├── ARCHITECTURE.md               # Questo documento
│
├── backend/
│   ├── Dockerfile                # Multi-stage, non-root user
│   ├── .dockerignore             # Esclude .env, __pycache__, .git
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
│       │   └── deps.py           # get_current_user dependency
│       ├── models/
│       │   ├── __init__.py       # Import ALL models (relationship resolution)
│       │   ├── user.py           # User (email, telegram_chat_id)
│       │   ├── task_list.py      # TaskList + ListMember (roles)
│       │   ├── task.py           # Task (priority 1-4, status enum)
│       │   ├── recurrence.py     # RecurrenceRule + TaskInstance
│       │   ├── notification.py   # Notification (channel, offset)
│       │   ├── habit.py          # Habit + HabitLog
│       │   └── pomodoro.py       # PomodoroSession
│       ├── api/routes/
│       │   ├── auth.py           # POST /register, /login (rate limited 5/min)
│       │   ├── lists.py          # CRUD liste
│       │   ├── tasks.py          # CRUD task + has_recurrence + ownership check
│       │   ├── recurrences.py    # Set/get/delete ricorrenza + ownership check
│       │   ├── habits.py         # CRUD abitudini, toggle, logs, stats + ownership check
│       │   ├── pomodoro.py       # Sessioni pomodoro + stats
│       │   └── telegram.py       # Webhook, link/unlink + HTML escape
│       ├── services/
│       │   ├── recurrence_service.py  # RRULE builder, occorrenze, workday adjust
│       │   └── telegram_service.py    # send_message async/sync
│       └── workers/
│           ├── celery_app.py     # Celery config, beat schedule
│           └── tasks.py          # generate_recurring_instances, check_notifications
│
└── frontend/
    ├── package.json
    ├── next.config.ts
    ├── tsconfig.json
    └── src/
        ├── app/
        │   ├── layout.tsx        # Geist font, dark theme, lang="it"
        │   ├── globals.css       # Tailwind, thin scrollbars
        │   ├── page.tsx          # Dashboard principale (routing viste)
        │   └── login/page.tsx    # Login/Register form
        ├── components/
        │   ├── Sidebar.tsx       # Navigazione + liste + create lista
        │   ├── TaskListView.tsx  # Lista task filtrata
        │   ├── TaskItem.tsx      # Riga task (checkbox, badge, date, recurrence icon)
        │   ├── TaskDetail.tsx    # Pannello dettaglio task (edit inline)
        │   ├── AddTaskForm.tsx   # Modal creazione task + ricorrenza
        │   ├── DatePicker.tsx    # Calendario popup (shortcuts + griglia + orario)
        │   ├── DayCalendar.tsx   # Vista giornaliera con timeline
        │   ├── HabitListView.tsx # Lista abitudini con week strip
        │   ├── HabitDetail.tsx   # Dettaglio abitudine (stats + calendario mensile)
        │   ├── AddHabitForm.tsx  # Modal creazione abitudine
        │   ├── EisenhowerMatrix.tsx # Matrice 2x2 priorita
        │   ├── PomodoroTimer.tsx # Timer circolare SVG
        │   └── PomodoroHistory.tsx  # Stats + cronologia sessioni
        ├── lib/
        │   ├── api.ts            # Client HTTP con JWT, 401 guard, 204 handling
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

**Soluzione**: Uso diretto di `bcrypt.hashpw()` e `bcrypt.checkpw()` in `security.py`, bypassando completamente passlib. JWT gestiti con `PyJWT` (attivamente mantenuto, sostituisce `python-jose` che ha CVE note).

### 3. Import esplicito di tutti i models

**Problema**: SQLAlchemy non riesce a risolvere le relationship se i modelli non sono importati.

**Soluzione**: `models/__init__.py` importa esplicitamente tutti i modelli. `main.py` fa `import app.models` prima di registrare i router.

### 4. RRULE RFC 5545 + Workday Adjustment

**Problema**: Serve supportare pattern come "primo lunedi dopo il 1 del mese" che RRULE standard non copre.

**Soluzione**: Due livelli:
1. **RRULE standard** tramite `python-dateutil` per frequenze base (daily, weekly, monthly, yearly)
2. **Post-processing custom** (`adjust_to_workday()`) che sposta la data calcolata al giorno lavorativo target

Parametri aggiuntivi nel model `RecurrenceRule`:
- `workday_adjust`: "none" | "next" | "prev"
- `workday_target`: 0-6 (giorno della settimana)

### 5. Priorita come Eisenhower Quadrants

**Mappatura**:
| Priorita | Valore | Colore | Quadrante Eisenhower |
|---|---|---|---|
| Urgente | 1 | Rosso | Urgente & Importante |
| Alta | 2 | Arancione | Non Urgente & Importante |
| Media | 3 | Giallo | Urgente & Non Importante |
| Bassa | 4 | Grigio | Non Urgente & Non Importante |

Questa mappatura permette alla matrice di Eisenhower di funzionare senza campi aggiuntivi nel database.

### 6. has_recurrence come campo calcolato

**Problema**: Il frontend deve sapere se un task ha una ricorrenza per mostrare l'icona, ma il campo non esiste nel model Task.

**Soluzione**: L'endpoint `GET /tasks/` fa una query aggiuntiva su `RecurrenceRule` per gli ID dei task restituiti e aggiunge `has_recurrence: bool` al response dict. Nessuna modifica allo schema DB.

### 7. Pomodoro Timer lato client

**Decisione**: Il timer gira interamente nel browser con `setInterval`. La sessione viene registrata nel backend solo al completamento.

**Motivazione**: Non serve persistenza durante il timer. Se l'utente chiude il browser, la sessione non viene registrata (comportamento atteso). Il timer usa un singolo interval con `isRunning` come unico dep, e un ref per evitare stale closures su `pomosCompleted`.

### 8. Optimistic UI Updates con rollback

**Pattern**: Per toggle abitudini e date picker, lo stato locale viene aggiornato immediatamente, poi la chiamata API parte in background. In caso di errore, lo stato viene ripristinato.

**Implementazione**:
- `handleToggleHabitLog`: salva `prevLogs`, aggiorna `weekLogs` localmente, rollback su catch
- `HabitDetail.handleDayClick`: salva `prevDates`, aggiorna `logDates` localmente, rollback su catch
- `DatePicker`: usa `localValue` state per riflettere la selezione immediatamente
- `handleUpdate` in `page.tsx`: usa il task restituito dal server per aggiornare `selectedTask`

### 9. Toggle endpoint per Habit Logs

**Decisione**: `POST /habits/{id}/toggle` crea il log se non esiste, lo elimina se esiste.

**Motivazione**: Semplifica il frontend (un'unica chiamata) e rispecchia il comportamento naturale di un checkbox. Restituisce `{checked: true/false}` per conferma.

---

## Sicurezza

### Autenticazione e Autorizzazione
- **JWT** con `PyJWT`, `SECRET_KEY` forte (64 char hex) in `.env`
- **bcrypt** per hashing password (diretto, min 8 char, max 128 char)
- **Ownership check** su tutte le route: tasks, ricorrenze, abitudini, pomodoro verificano `created_by == user.id`
- **List access check**: la creazione task verifica che l'utente sia owner o membro della lista
- **Rate limiting**: `slowapi` 5 req/min su `/auth/login` e `/auth/register`

### Validazione Input
- **Priority**: `Field(ge=1, le=4)` - solo valori 1-4
- **Frequency**: `Literal["daily", "weekly", "monthly", "yearly"]`
- **Password**: `Field(min_length=8, max_length=128)`
- **Preview count**: `Query(default=10, le=100)` - max 100 occorrenze

### Infrastruttura
- **CORS** limitato a `http://localhost:3000`, metodi e header specifici
- **`.env`** con secrets escluso dal git, nessun default debole in produzione
- **PostgreSQL e Redis non esposti** sull'host (solo rete Docker interna)
- **Network segmentation**: rete `internal` per DB/Redis/workers, rete `frontend` per il backend
- **Container non-root**: utente `app` dedicato
- **Multi-stage Dockerfile**: build tools esclusi dall'immagine finale
- **`.dockerignore`**: esclude `.env`, `__pycache__`, `.git`
- **HTML escape** nei messaggi Telegram (`html.escape()` su contenuti utente)
- **Exception handling specifico**: `jwt.InvalidTokenError` invece di `except Exception`

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
└── is_admin (BOOLEAN)
```

### Task Management
```
lists                          tasks
├── id (PK)                    ├── id (PK)
├── name                       ├── title
├── color                      ├── description
├── icon                       ├── list_id (FK -> lists)
├── owner_id (FK -> users)     ├── created_by (FK -> users)
│                              ├── assigned_to (FK -> users)
list_members                   ├── priority (1-4, validated)
├── list_id (FK)               ├── status (todo/doing/done)
├── user_id (FK)               ├── due_date
└── role (owner/edit/view)     ├── due_time
                               └── parent_id (self-ref, subtasks)
```

### Ricorrenze
```
recurrence_rules               task_instances
├── id (PK)                    ├── id (PK)
├── task_id (FK -> tasks)      ├── task_id (FK -> tasks)
├── rrule (TEXT)               ├── due_date
├── workday_adjust (ENUM)      ├── status (todo/done/skip)
├── workday_target (INT)       ├── completed_at
└── next_occurrence            └── completed_by (FK -> users)
```

### Abitudini
```
habits                         habit_logs
├── id (PK)                    ├── id (PK)
├── name                       ├── habit_id (FK -> habits)
├── description                ├── user_id (FK -> users)
├── list_id (FK, nullable)     ├── log_date (DATE)
├── created_by (FK -> users)   ├── value (FLOAT)
├── frequency_type             └── note
├── frequency_days (ARRAY)
├── times_per_period
├── time_of_day
├── start_date / end_date
├── color
├── icon
├── position
└── is_archived
```

### Pomodoro
```
pomodoro_sessions
├── id (PK)
├── user_id (FK -> users)
├── task_id (FK -> tasks, nullable)
├── started_at (TIMESTAMPTZ)
├── ended_at (TIMESTAMPTZ)
├── duration_minutes
└── session_type (pomodoro/short_break/long_break)
```

### Notifiche
```
notifications
├── id (PK)
├── user_id (FK -> users)
├── task_id (FK, nullable)
├── habit_id (FK, nullable)
├── channel (TELEGRAM/EMAIL)
├── offset_minutes
└── sent_at
```

---

## API Endpoints

### Autenticazione (rate limited: 5/min)
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/auth/register` | Registrazione utente (password min 8 char) |
| POST | `/api/auth/login` | Login, restituisce JWT |

### Liste
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/lists/` | Tutte le liste dell'utente (proprie + condivise) |
| POST | `/api/lists/` | Crea lista |

### Task (con ownership check)
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/tasks/` | Task con filtri (list_id, status) + `has_recurrence` |
| POST | `/api/tasks/` | Crea task (verifica accesso alla lista) |
| PATCH | `/api/tasks/{id}` | Aggiorna task (solo owner) |
| DELETE | `/api/tasks/{id}` | Elimina task (solo owner) |

### Ricorrenze (con ownership check)
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/tasks/{id}/recurrence` | Imposta/aggiorna ricorrenza (validated frequency) |
| GET | `/api/tasks/{id}/recurrence` | Dettaglio ricorrenza |
| DELETE | `/api/tasks/{id}/recurrence` | Rimuovi ricorrenza |
| GET | `/api/tasks/{id}/recurrence/preview` | Anteprima prossime N date (max 100) |
| GET | `/api/tasks/{id}/instances` | Istanze generate |
| PATCH | `/api/instances/{id}` | Completa istanza |

### Abitudini (con ownership check)
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/habits/` | Tutte le abitudini attive |
| POST | `/api/habits/` | Crea abitudine |
| PATCH | `/api/habits/{id}` | Modifica abitudine |
| DELETE | `/api/habits/{id}` | Elimina abitudine |
| POST | `/api/habits/{id}/toggle` | Toggle check-in per data |
| POST | `/api/habits/{id}/log` | Registra log manuale |
| GET | `/api/habits/{id}/logs` | Log mensili (year, month) |
| GET | `/api/habits/{id}/stats` | Statistiche (streak, rate, totali) |
| GET | `/api/habits/logs/week` | Log settimanali di tutte le abitudini |

### Pomodoro
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/pomodoro/` | Registra sessione completata |
| GET | `/api/pomodoro/` | Ultime 100 sessioni |
| GET | `/api/pomodoro/stats` | Stats (oggi + totali) |

### Telegram
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/telegram/webhook` | Riceve messaggi dal bot (HTML escaped) |
| POST | `/api/telegram/link` | Genera codice di collegamento |
| DELETE | `/api/telegram/unlink` | Scollega account |
| GET | `/api/telegram/status` | Stato collegamento |

### Sistema
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/health` | Healthcheck |

---

## Viste Frontend

### 1. Inbox / Today / Next 7 Days
Vista classica a lista: sidebar (navigazione + liste) | lista task filtrata | dettaglio task o calendario giornaliero.

### 2. Vista per Lista
Stessa struttura, filtrata per `list_id`.

### 3. Abitudini
Lista abitudini con week strip (pallini cliccabili Lun-Dom) | dettaglio con statistiche e calendario mensile.

### 4. Matrice di Eisenhower
Griglia 2x2 che mappa le 4 priorita (solo task non completati). Ogni quadrante raggruppa i task per scadenza (Scaduti > Oggi > Prossimi 7gg > Dopo).

### 5. Pomodoro
Timer circolare SVG con progress ring (25/5/15 min) | pannello destro con overview statistiche e cronologia sessioni.

---

## Celery Beat - Task Periodici

| Task | Schedule | Funzione |
|---|---|---|
| `generate_recurring_instances` | Ogni giorno alle 00:05 | Genera `TaskInstance` per i prossimi 7 giorni basandosi sulle `RecurrenceRule` |
| `check_and_send_notifications` | Ogni 60 secondi | Verifica notifiche non inviate e le invia via Telegram |

Timezone: `Europe/Rome`

---

## Come Avviare

```bash
# 1. Configura le variabili d'ambiente
cp .env.example .env
# Genera secrets forti:
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"
python3 -c "import secrets; print('DB_PASSWORD=' + secrets.token_hex(16))"
# Inserisci i valori generati in .env

# 2. Avvia i servizi Docker
docker compose up -d

# 3. Esegui le migrazioni (prima volta)
docker compose exec backend alembic upgrade head

# 4. Avvia il frontend (sviluppo)
cd frontend
npm install
npm run dev

# L'app e' disponibile su http://localhost:3000
# Le API su http://localhost:8000/api
# Docs OpenAPI su http://localhost:8000/docs
```

---

## Sviluppi Futuri

- **Bot Telegram interattivo**: polling o webhook via Cloudflare Tunnel
- **Multi-utente familiare**: inviti, liste condivise con ruoli
- **PWA / App mobile**: React Native o Progressive Web App
- **Drag & drop**: riordinamento task e abitudini
- **Grafici e statistiche avanzate**: trend settimanali, heatmap annuale abitudini
- **Backup automatico**: export dati, backup PostgreSQL schedulato
- **Temi personalizzabili**: oltre al dark theme attuale
- **Refresh token flow**: access token breve + refresh per maggiore sicurezza
