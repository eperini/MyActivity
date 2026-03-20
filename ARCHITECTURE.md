# Zeno - Documentazione Architetturale

## Panoramica

**Zeno** (precedentemente myActivity) e' un'applicazione self-hosted per la gestione di task, abitudini e produttivita personale, ispirata a Things 3 e TickTick. Progettata per uso familiare multi-utente, gira interamente su un Mac Mini tramite Docker Desktop.

### Obiettivi principali
- Gestione task con ricorrenze avanzate (inclusi pattern lavorativi)
- Organizzazione gerarchica Things 3: Aree → Progetti → Headings → Task
- Campi custom per progetto con default per tipo
- Dipendenze tra task con rilevamento cicli
- Automazioni regole-based per progetto
- Sprint con metriche di avanzamento
- Epic per progetto con time tracking e sync Jira
- Time tracking manuale con sync bidirezionale Tempo Cloud
- Report periodici automatici (PDF/Excel) con invio email
- Tracking abitudini con streak e statistiche
- Notifiche proattive via Telegram, Web Push e Email
- Notifiche in-app con inbox
- Matrice di Eisenhower per prioritizzazione visiva
- Kanban board con drag & drop per gestione stati
- Timer Pomodoro integrato con storico sessioni
- Subtask con progress bar e template riutilizzabili
- Google Calendar sync bidirezionale
- Google Drive backup automatico
- Import da TickTick (CSV)
- Quick add con linguaggio naturale (italiano)
- iPhone Action Button via iOS Shortcuts
- Guided tour onboarding interattivo per nuovi utenti
- Interfaccia in italiano con tema scuro

---

## Stack Tecnologico

### Backend
| Componente | Tecnologia | Versione | Motivazione |
|---|---|---|---|
| Framework API | FastAPI | 0.115.6 | Async nativo, auto-documentazione OpenAPI, validazione Pydantic |
| Database | PostgreSQL | 16 (Alpine) | ACID, supporto ARRAY nativo per `frequency_days`, JSONB per campi custom |
| ORM | SQLAlchemy | 2.0.36 | Async con `asyncpg`, mapped columns, relationship resolution |
| Migrazioni | Alembic | 1.14.0 | Integrazione SQLAlchemy, autogenerate |
| Cache/Broker | Redis | 7 (Alpine) | Broker Celery, veloce, persistenza opzionale |
| Task Queue | Celery | 5.4.0 | Beat scheduler per notifiche, istanze ricorrenti, report, backup, sync |
| Autenticazione | PyJWT + bcrypt | - | JWT in HttpOnly cookie, bcrypt diretto, API key per shortcuts |
| Rate Limiting | slowapi | 0.1.9 | Protezione brute-force su auth endpoints |
| Ricorrenze | python-dateutil | 2.9.0 | Parsing RRULE RFC 5545, calcolo occorrenze |
| Notifiche | httpx + pywebpush | - | Telegram Bot API, Web Push VAPID, Email SMTP |
| Google | google-api-python-client | - | Calendar sync, Drive backup |
| Report | ReportLab + openpyxl | - | Generazione PDF e Excel server-side |

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
| Orchestrazione | Docker Compose | 6 servizi produzione + 5 servizi dev paralleli |
| Host | Mac Mini | Self-hosted, sempre acceso, Docker Desktop |
| Accesso remoto | Tailscale | VPN mesh per accesso da iPhone/altri dispositivi |
| HTTPS | Caddy + Tailscale certs | Reverse proxy con certificati validi, auto-start via LaunchAgent |
| Variabili | .env | Secrets fuori dal codice, gitignored |
| Container | Multi-stage, non-root | Sicurezza e dimensioni immagine ridotte |

---

## Architettura dei Servizi

```
                    ┌──────────────────────────────────────┐
                    │  Caddy (HTTPS reverse proxy :443)    │
                    │  raffaello-mac-mini.tail*.ts.net     │
                    └──────┬──────────────┬────────────────┘
                           │ /api/*       │ /*
                           ▼              ▼
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend   │────▶│Google Calendar│
│  Next.js     │:3000│   FastAPI   │:8000│Google Drive   │
│  (produzione)│     │  (uvicorn)  │     └──────────────┘
└─────────────┘     └──────┬──────┘
                           │         ┌──────────────┐
              ┌────────────┼─────────│  Jira REST   │
              │            │         │  Tempo Cloud  │
              ▼            ▼         └──────────────┘
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
       │  backup,      │    │              │
       │  Tempo sync,  │    │              │
       │  Jira sync)   │    │              │
       └──────────────┘    └──────────────┘
              │
       ┌──────────────┐
       │ Telegram Bot │
       │  (polling)   │
       └──────────────┘
```

### HTTPS con Caddy + Tailscale

**Caddy** funge da reverse proxy HTTPS davanti a frontend e backend. I certificati sono generati da Tailscale (`tailscale cert`) e sono validi su tutti i dispositivi della rete Tailscale.

| URL | Destinazione |
|---|---|
| `https://raffaello-mac-mini.tail*.ts.net` | Produzione (frontend :3000, API :8000) |
| `https://raffaello-mac-mini.tail*.ts.net:3443` | ZenoDev (frontend :3100, API :8100) |

Routing: `/api/*` → backend, tutto il resto → frontend. Il frontend rileva automaticamente HTTPS e usa `window.location.origin/api` invece di `hostname:8000`.

Configurazione: `Caddyfile` nella root del progetto. Certificati in `certs/` (gitignored).

### LaunchAgents (auto-start al login)

| LaunchAgent | Funzione |
|---|---|
| `com.zeno.docker-compose` | `docker compose up -d` dopo che Docker Desktop e' pronto |
| `com.zeno.frontend` | `npm run start` su :3000 dopo che il backend e' pronto |
| `com.zeno.caddy` | Caddy reverse proxy HTTPS (KeepAlive) |

### Docker Compose Produzione - 6 servizi

1. **db** - PostgreSQL 16 Alpine, volume persistente, rete `internal`
2. **redis** - Redis 7 Alpine, volume `redis_data`, rete `internal`
3. **backend** - FastAPI con uvicorn, porta 8000 esposta, reti `internal` + `frontend`
4. **celery-worker** - Stesso container del backend, comando `celery worker`, rete `internal`
5. **celery-beat** - Stesso container, comando `celery beat`, rete `internal`
6. **telegram-bot** - Bot Telegram in polling, rete `internal`

### Docker Compose Dev (ZenoDev) - 5 servizi

File: `docker-compose.dev.yml`. Ambiente di sviluppo parallelo con DB e volumi separati. Telegram, backup, email e Tempo disabilitati per non interferire con la produzione.

| Servizio | Porta | Note |
|---|---|---|
| db-dev | 5434 | Database `myactivity_dev` |
| redis-dev | 6380 | Istanza Redis separata |
| backend-dev | 8100 | Stesse immagini, env diverse |
| celery-worker-dev | - | Senza notifiche esterne |
| celery-beat-dev | - | Scheduler separato |

Comandi: `./dev.sh [up|down|logs|restart|migrate|frontend|status]`

**Network segmentation**: DB e Redis sono raggiungibili solo dalla rete `internal`. Solo il backend e' esposto sulla rete `frontend` (porta 8000).

---

## Struttura del Progetto

```
myActivity/
├── .env                          # Secrets (gitignored)
├── .env.example                  # Template variabili
├── docker-compose.yml
├── docker-compose.dev.yml        # Ambiente dev parallelo (ZenoDev)
├── Caddyfile                     # Reverse proxy HTTPS config
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
│       │   ├── user.py           # User (email, telegram_chat_id, api_key, is_admin, has_seen_tour)
│       │   ├── task.py           # Task (priority 1-4, status enum, project_id, heading_id, time_only, jira fields)
│       │   ├── recurrence.py     # RecurrenceRule + TaskInstance
│       │   ├── notification.py   # TaskReminder (channel, offset)
│       │   ├── habit.py          # Habit + HabitLog
│       │   ├── pomodoro.py       # PomodoroSession
│       │   ├── push_subscription.py # PushSubscription (VAPID)
│       │   ├── tag.py            # Tag + task_tags association
│       │   ├── comment.py        # Comment
│       │   ├── template.py       # TaskTemplate (JSON subtasks/recurrence)
│       │   ├── area.py           # Area (name, color, icon, position, owner_id)
│       │   ├── project.py        # Project + ProjectMember (area_id, type, status)
│       │   ├── heading.py        # ProjectHeading (name, position) — sezioni Things 3
│       │   ├── custom_field.py   # ProjectCustomField (field_type, options JSONB)
│       │   ├── dependency.py     # TaskDependency (blocks/relates_to/duplicates)
│       │   ├── automation.py     # AutomationRule (trigger/action types, JSONB config)
│       │   ├── sprint.py         # Sprint + sprint_tasks association
│       │   ├── epic.py           # Epic (project_id, status, jira fields, time_logs)
│       │   ├── time_log.py       # TimeLog (task/epic, minutes, Tempo sync) + TimeLogDeleted
│       │   ├── tempo.py          # TempoUser + TempoImportLog + TempoPushLog
│       │   ├── jira.py           # JiraConfig + JiraUserMapping
│       │   ├── sharing.py        # ProjectInvitation + AppNotification + UserProjectArea
│       │   └── report.py         # ReportConfig + ReportHistory
│       ├── api/routes/
│       │   ├── access.py         # _check_task_access() helper
│       │   ├── auth.py           # Register, login, logout, profile, API key
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
│       │   ├── templates.py      # CRUD template + from-task + instantiate
│       │   ├── areas.py          # CRUD aree + reorder
│       │   ├── projects.py       # CRUD progetti + members + stats
│       │   ├── headings.py       # CRUD headings + reorder
│       │   ├── custom_fields.py  # CRUD campi custom + reorder
│       │   ├── dependencies.py   # Dipendenze task + cycle detection
│       │   ├── automations.py    # CRUD regole automazione + toggle
│       │   ├── sprints.py        # CRUD sprint + add/remove task
│       │   ├── epics.py          # CRUD epic + reorder + Jira push + time logs
│       │   ├── time_logs.py      # CRUD time log su task + weekly summary + report + export
│       │   ├── tempo.py          # Import/push Tempo + users + config + status
│       │   ├── jira.py           # Config sync + users mapping + manual sync
│       │   ├── invitations.py    # Inviti progetto + accept/decline
│       │   ├── notifications.py  # In-app notifications + mark read
│       │   └── reports.py        # Report configs + generate + history
│       ├── services/
│       │   ├── recurrence_service.py    # RRULE builder, occorrenze, workday adjust
│       │   ├── telegram_service.py      # send_message async/sync
│       │   ├── notification_service.py  # Dispatch notifiche multi-canale
│       │   ├── google_calendar.py       # Push/pull/delete eventi
│       │   ├── google_drive.py          # Upload backup + rotazione
│       │   ├── email_service.py         # SMTP Gmail per report
│       │   ├── quickadd_parser.py       # Parser italiano (regex-based)
│       │   ├── jira_service.py          # Sync Jira epic/task bidirezionale
│       │   ├── tempo_service.py         # Client API Tempo Cloud
│       │   ├── tempo_import_service.py  # Import worklogs Tempo → Zeno
│       │   ├── tempo_push_service.py    # Push ore Zeno → Tempo (aggregazione per entity/giorno)
│       │   ├── report_service.py        # Orchestrazione report periodici
│       │   ├── pdf_generator.py         # Generazione PDF con ReportLab
│       │   └── excel_generator.py       # Generazione Excel con openpyxl
│       └── workers/
│           ├── celery_app.py     # Celery config, beat schedule
│           └── tasks.py          # Istanze ricorrenti, notifiche, report, backup, sync, automazioni
│
├── frontend/
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── public/
│   │   ├── manifest.json         # PWA manifest
│   │   └── sw.js                 # Service worker per push notifications
│   ├── e2e/                      # Test E2E Playwright
│   └── src/
│       ├── app/
│       │   ├── layout.tsx        # Geist font, dark theme, lang="it", Providers
│       │   ├── globals.css       # Tailwind, thin scrollbars
│       │   ├── page.tsx          # Dashboard principale (routing viste)
│       │   └── login/page.tsx    # Login/Register form
│       ├── components/
│       │   ├── Providers.tsx         # Context providers (Toast, Theme, Onboarding)
│       │   ├── Sidebar.tsx           # Navigazione + aree/progetti + favorites + collapsible sections
│       │   ├── TaskListView.tsx      # Lista task filtrata + ordinamento
│       │   ├── TaskItem.tsx          # Riga task (orologio + checkbox, colonne: Jira/ore/ricorrenza/data)
│       │   ├── TaskDetail.tsx        # Pannello dettaglio (edit, subtask, tag, commenti, time log, custom fields, dipendenze)
│       │   ├── AddTaskForm.tsx       # Creazione task (structured + quick + template, defaultProjectId, time_only)
│       │   ├── DatePicker.tsx        # Calendario popup (shortcuts + griglia + orario)
│       │   ├── DayCalendar.tsx       # Vista giornaliera con timeline
│       │   ├── CalendarView.tsx      # Calendario mensile con task
│       │   ├── KanbanView.tsx        # Board 3 colonne con drag & drop
│       │   ├── EisenhowerMatrix.tsx  # Matrice 2x2 priorita
│       │   ├── HabitListView.tsx     # Lista abitudini con week strip
│       │   ├── HabitDetail.tsx       # Dettaglio abitudine (stats + calendario mensile)
│       │   ├── AddHabitForm.tsx      # Modal creazione abitudine
│       │   ├── PomodoroTimer.tsx     # Timer circolare SVG
│       │   ├── PomodoroHistory.tsx   # Stats + cronologia sessioni
│       │   ├── StatsView.tsx         # Dashboard statistiche
│       │   ├── SettingsView.tsx      # Tutte le impostazioni (tab: Generale, Integrazioni, Admin)
│       │   ├── Toast.tsx             # ToastProvider context, auto-dismiss 4s
│       │   ├── BottomTabBar.tsx      # Tab bar mobile (5 tab con ciclo "More")
│       │   ├── MobileHeader.tsx      # Header mobile con hamburger
│       │   ├── FloatingAddButton.tsx # FAB mobile
│       │   ├── ProjectView.tsx       # Vista progetto (header, stats, task con headings, epic, sprint)
│       │   ├── ProjectMembersPanel.tsx # Gestione membri progetto
│       │   ├── CustomFieldsPanel.tsx # Pannello campi custom in TaskDetail
│       │   ├── CustomFieldEditor.tsx # Editor definizioni campi custom
│       │   ├── DependenciesPanel.tsx # Pannello dipendenze in TaskDetail
│       │   ├── AutomationsView.tsx   # Editor regole automazione
│       │   ├── SprintBoard.tsx       # Board sprint con metriche
│       │   ├── TimeLogForm.tsx       # Form registrazione ore (shortcut 30m-8h, date picker, nota)
│       │   ├── TimeLogPanel.tsx      # Pannello time log in TaskDetail (lista, edit inline, aggiungi)
│       │   ├── QuickLogView.tsx      # Quick log ore: lista epic + timesheet settimanale
│       │   ├── WeeklyTimeReport.tsx  # Report ore settimanale con dettaglio giorno
│       │   ├── ReportsView.tsx       # Configurazione e generazione report periodici
│       │   ├── TempoImportPanel.tsx  # Import manuale worklogs da Tempo
│       │   ├── TempoUsersPanel.tsx   # Admin: mapping utenti Tempo → Zeno
│       │   ├── TempoSettingsPanel.tsx # Configurazione API Tempo
│       │   ├── ReminderPanel.tsx     # Impostazioni notifiche/reminder
│       │   ├── UserManagementPanel.tsx # Admin: gestione utenti
│       │   ├── AcceptInvitationDialog.tsx # Dialog accettazione inviti
│       │   ├── NotificationsPanel.tsx # Inbox notifiche in-app
│       │   ├── KeyboardShortcutsModal.tsx # Modal con lista shortcut tastiera
│       │   └── onboarding/
│       │       ├── OnboardingProvider.tsx  # Context + state machine tour guidato
│       │       ├── SpotlightOverlay.tsx    # Overlay scuro con cutout spotlight
│       │       ├── TourTooltip.tsx         # Tooltip posizionato con contenuto step
│       │       ├── TourLauncher.tsx        # Pannello selezione percorsi tour
│       │       ├── types.ts               # Interfacce Tour/TourStep
│       │       └── tours/                 # Definizioni tour tematici
│       ├── hooks/
│       │   ├── useIsMobile.ts         # Breakpoint md (768px)
│       │   ├── useKeyboardShortcuts.ts # Shortcut tastiera globali
│       │   └── useTheme.tsx           # Gestione tema dark/light
│       ├── lib/
│       │   ├── api.ts            # Client HTTP con cookie auth, 401 guard
│       │   └── dates.ts          # formatRelativeDate, isOverdue
│       └── types/
│           └── index.ts          # Interfacce TypeScript
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

**Soluzione**: La funzione `_enrich_with_recurrence()` carica in batch: ricorrenze, tag, assigned_to_name, subtask_count/subtask_done_count, time_logs. Tutti gli endpoint che restituiscono Task passano per questa funzione.

### 5. Modello Things 3: Aree → Progetti → Headings → Task

**Decisione**: Unificazione del modello Liste in Progetti. I task hanno `project_id` (opzionale) e `heading_id` (opzionale) per raggruppamento in sezioni.

**Gerarchia**: Area → Progetto → Heading → Task. Le aree sono contenitori tematici (es. Family, Lavoro). I progetti hanno tipo (technical/administrative/personal), stato (active/on_hold/completed/archived), e membri con ruoli. Gli heading sono sezioni all'interno dei progetti per raggruppare task logicamente.

**Status task**: `todo`, `doing`, `done`, `someday`. Lo status `someday` indica task parcheggiati in "Prima o Poi".

**Scheduling**: Ogni task ha `start_date` (quando iniziare) e `due_date` (scadenza). La vista "Oggi" mostra task con start_date <= oggi O due_date = oggi. L'Inbox raccoglie task senza progetto e senza date.

### 6. Campi custom per tipo progetto

**Decisione**: Alla creazione di un progetto, vengono auto-popolati campi custom di default in base al `project_type`:
- **technical**: Sprint, Story Points, Component, Branch Name
- **administrative**: Budget, Deadline, Priority Level, Owner
- **personal**: Category, Notes, Reminder Date

I campi sono definiti in `ProjectCustomField` e i valori salvati come JSONB (`custom_fields`) nel Task.

### 7. RRULE RFC 5545 + Workday Adjustment

**Soluzione**: Due livelli:
1. **RRULE standard** tramite `python-dateutil` per frequenze base
2. **Post-processing custom** (`adjust_to_workday()`) che sposta la data al giorno lavorativo target

### 8. Priorita come Eisenhower Quadrants

| Priorita | Valore | Colore | Quadrante Eisenhower |
|---|---|---|---|
| Urgente | 1 | Rosso | Urgente & Importante |
| Alta | 2 | Arancione | Non Urgente & Importante |
| Media | 3 | Giallo | Urgente & Non Importante |
| Bassa | 4 | Grigio | Non Urgente & Non Importante |

### 9. Route ordering FastAPI

**Regola**: Le route statiche (`/reorder`, `/reset-order`) devono essere definite PRIMA delle route parametriche (`/{list_id}`, `/{task_id}`) per evitare che FastAPI matchi "reorder" come parametro intero.

### 10. Task defaults e ordinamento

- **Data**: default a "oggi" alla creazione
- **Assegnazione**: auto-assegnato al creatore se non specificato
- **Progetto**: se `defaultProjectId` e' fornito (es. da ProjectView), il selettore lo preseleziona; altrimenti il default e' "Nessun progetto"
- **Ordinamento lista task**: query backend ordina per `position, id` per supportare riordino manuale
- **Ordinamento ProjectView**: task time_only prima, poi per due_date ascendente, poi per position manuale. Stesso ordinamento sia per task non raggruppati che per task dentro sezioni heading
- **Vista Oggi**: include task con start_date <= oggi, due_date = oggi, e task scaduti (overdue)
- **Vista Prossimi 7gg**: include task con scadenza entro 7 giorni + overdue

### 11. Rilevamento cicli nelle dipendenze

**Soluzione**: Recursive CTE in PostgreSQL per verificare che aggiungere una dipendenza `blocks` non crei un ciclo. Solo il tipo `blocks` viene verificato (non `relates_to` o `duplicates`).

### 12. Automazioni con depth guard

**Problema**: Le automazioni possono causare loop infiniti (es. status_changed → change_status → status_changed).

**Soluzione**: Il Celery task `evaluate_automations` accetta un parametro `depth` (max 3). L'azione `create_task` non re-triggera automazioni. Tutte le azioni sono wrappate in try/except per isolamento errori.

### 13. Sprint con task condivisi

**Decisione**: `sprint_tasks` e' una tabella di associazione N:M — un task puo' appartenere a piu' sprint (es. backlog → sprint attivo). Gli sprint hanno status transitions: planned → active → completed.

### 14. Time tracking con sync Tempo bidirezionale

**Architettura**: I `TimeLog` possono essere associati a task o epic. Ogni log ha `source` (manual/tempo) e campi per Tempo sync (`tempo_worklog_id`, `tempo_push_status`, `tempo_pushed_at`).

**Import Tempo → Zeno**: Fetch worklogs da API Tempo, matching per `tempo_worklog_id`, creazione/aggiornamento time_log con deduplicazione. Risoluzione Jira issue → epic/task tramite `jira_issue_key`.

**Push Zeno → Tempo**: Aggregazione time_log per (entity + user + giorno), push a Tempo API. Tombstone table `TimeLogDeleted` per sincronizzare cancellazioni di log gia' pushati.

**TempoUser**: Mapping utenti Tempo → Zeno via `tempo_account_id`. Utenti non linkati (ghost users) hanno `zeno_user_id = null`. Audit trail completo con `TempoImportLog` e `TempoPushLog`.

### 15. Epic come entita' di primo livello

**Decisione**: Gli Epic sono entita' separate dai task, associati a un progetto. Hanno stato, date, campi Jira e time_logs propri. Usati come unita' di tracking ore nel QuickLog e per sync con Jira epic/story.

### 16. Notifiche in-app (AppNotification)

**Architettura**: Modello `AppNotification` separato dai `TaskReminder`. Supporta tipi: task_assigned, task_status_changed, task_commented, task_due_soon, project_invitation, sprint_started, sprint_completed, mention, automation_triggered, tempo_sync_error, report_ready. Ogni notifica ha `is_read`, `read_at`, e flag per dispatch multicanale (telegram, push).

### 17. Inviti progetto

**Flusso**: Invito via email con token sicuro (48 byte urlsafe), scadenza 7 giorni. Status: pending → accepted/declined/expired/cancelled. Celery task `expire_pending_invitations` pulisce gli inviti scaduti ogni notte.

### 18. Report periodici

**Architettura**: `ReportConfig` definisce report schedulati per tipo (person/project/client), frequenza (weekly/monthly), con invio email. `ReportHistory` traccia ogni generazione con file PDF/Excel e dati JSON. Generazione server-side con ReportLab (PDF) e openpyxl (Excel).

---

## Sicurezza

### Autenticazione e Autorizzazione
- **JWT** in HttpOnly cookie, durata 24h, SameSite=Lax
- **Dual auth**: cookie + Bearer header + API key (X-API-Key)
- **bcrypt** per hashing password (diretto, min 8 char, max 128 char)
- **API key** hashata con SHA-256 nel DB per iOS Shortcuts
- **Project access check**: owner O membro su tutte le operazioni progetto/task
- **IDOR fix**: comments, tags, push subscription, project_id assignment verificano accesso
- **Rate limiting**: `slowapi` 5 req/min su `/auth/login` e `/auth/register`
- **Backup**: solo admin (is_admin check)
- **FK ondelete**: tasks.created_by e assigned_to usano SET NULL (non CASCADE)
- **Automation depth guard**: max 3 livelli di ricorsione per prevenire loop infiniti
- **Cycle detection**: recursive CTE per dipendenze task (tipo blocks)
- **Sprint task access**: verifica project access prima di aggiungere task a sprint
- **Invitation token**: 48 byte urlsafe, scadenza 7 giorni

### Validazione Input
- **Title**: max 500 char
- **Description**: max 5000 char
- **Comment**: max 5000 char
- **Quick add**: max 500 char
- **Priority**: `Field(ge=1, le=4)`
- **Tag color**: regex `^#[0-9a-fA-F]{6}$`
- **Member role**: pattern `^(admin|super_user|user)$`

### Infrastruttura
- **HTTPS** via Caddy + certificati Tailscale (validi, no self-signed warnings)
- **CORS** limitato, metodi e header specifici (include dominio HTTPS Tailscale)
- **`.env`** con secrets escluso dal git, SECRET_KEY obbligatorio (startup check)
- **PostgreSQL e Redis non esposti** sull'host (solo rete Docker interna)
- **Container non-root**: utente `app` dedicato
- **HTML escape** nei messaggi Telegram e email report
- **Toast feedback**: tutte le operazioni mostrano errori all'utente
- **Certificati Tailscale** in `certs/` (gitignored)

---

## Modello Dati

### Users
```
users
├── id (PK)
├── email (UNIQUE)
├── password_hash
├── display_name
├── telegram_chat_id (BIGINT, nullable)
├── is_admin (BOOLEAN)
├── api_key (nullable, UNIQUE)
├── jira_account_id (nullable)
├── has_seen_tour (BOOLEAN, default false)
├── daily_report_email (BOOLEAN)
├── daily_report_push (BOOLEAN)
├── daily_report_time (TIME, nullable)
├── daily_report_last_sent (DATETIME, nullable)
└── created_at
```

### Task Management
```
tasks
├── id (PK)
├── title
├── description
├── created_by (FK -> users, SET NULL)
├── assigned_to (FK -> users, SET NULL, nullable)
├── priority (1-4)
├── status (todo/doing/done/someday)
├── due_date
├── due_time
├── start_date (nullable)
├── completed_at
├── parent_id (self-ref FK, CASCADE)
├── project_id (FK -> projects, SET NULL, nullable)
├── heading_id (FK -> project_headings, SET NULL, nullable)
├── custom_fields (JSONB)
├── time_only (BOOLEAN, default false)
├── estimated_minutes (INT, nullable)
├── jira_issue_key (nullable)
├── jira_issue_id (nullable)
├── jira_synced_at (nullable)
├── jira_url (nullable)
├── google_event_id (nullable)
├── position (INT)
├── created_at
└── updated_at
```

### Aree, Progetti, Headings
```
areas                          projects
├── id (PK)                    ├── id (PK)
├── name                       ├── area_id (FK -> areas, SET NULL, nullable)
├── color                      ├── name
├── icon                       ├── description
├── owner_id (FK -> users)     ├── project_type (technical/administrative/personal)
├── position (INT)             ├── status (active/on_hold/completed/archived)
└── created_at                 ├── color / icon
                               ├── owner_id (FK -> users, CASCADE)
project_members                ├── start_date / target_date
├── id (PK)                    ├── client_name
├── project_id (FK, CASCADE)   ├── position (INT)
├── user_id (FK, CASCADE)      ├── created_at
└── role (admin/edit/view)     └── updated_at

project_headings               project_custom_fields
├── id (PK)                    ├── id (PK)
├── project_id (FK, CASCADE)   ├── project_id (FK, CASCADE)
├── name                       ├── name
├── position (INT)             ├── field_key (UNIQUE con project_id)
└── created_at                 ├── field_type (text/number/date/select/multi_select/boolean/url)
                               ├── options (JSONB, nullable)
                               ├── default_value (JSONB, nullable)
                               ├── is_required (BOOLEAN)
                               └── position (INT)
```

### Epic e Time Tracking
```
epics                          time_logs
├── id (PK)                    ├── id (PK)
├── project_id (FK, CASCADE)   ├── task_id (FK, CASCADE, nullable)
├── name                       ├── epic_id (FK, CASCADE, nullable)
├── description                ├── user_id (FK, CASCADE, nullable)
├── status (todo/in_progress/done) ├── logged_at (DATE)
├── color                      ├── minutes (INT)
├── start_date / target_date   ├── note
├── completed_at               ├── source (manual/tempo)
├── jira_issue_key             ├── tempo_worklog_id (nullable)
├── jira_issue_id              ├── tempo_user_id (FK, SET NULL, nullable)
├── jira_synced_at             ├── tempo_push_status (pending/pushed/error)
├── jira_url                   ├── tempo_push_error
├── position (INT)             ├── tempo_pushed_at
├── created_by (FK, SET NULL)  ├── created_at
├── created_at                 └── updated_at
└── updated_at
                               time_logs_deleted (tombstone)
                               ├── id (PK)
                               ├── original_log_id
                               ├── tempo_worklog_id
                               ├── deleted_at
                               ├── synced_to_tempo (BOOLEAN)
                               └── sync_attempted_at
```

### Integrazioni Esterne
```
tempo_users                    tempo_import_log
├── id (PK)                    ├── id (PK)
├── tempo_account_id (UNIQUE)  ├── triggered_by (FK -> users)
├── display_name               ├── period_from / period_to
├── email                      ├── status (running/completed/error)
├── zeno_user_id (FK, SET NULL)├── worklogs_found/created/updated/skipped
├── is_active (BOOLEAN)        ├── error_message
├── created_at                 ├── started_at
└── updated_at                 └── completed_at

tempo_push_log                 jira_config
├── id (PK)                    ├── id (PK)
├── triggered_by (FK)          ├── user_id (FK, CASCADE)
├── status                     ├── jira_project_key
├── logs_found/pushed/updated  ├── zeno_project_id (FK, CASCADE)
├── logs_deleted/skipped/error ├── sync_enabled (BOOLEAN)
├── error_message              ├── last_sync_at / status / error
├── started_at                 └── created_at
└── completed_at
                               jira_user_mappings
                               ├── id (PK)
                               ├── config_id (FK, CASCADE)
                               ├── jira_account_id
                               ├── jira_display_name / email
                               └── zeno_user_id (FK, SET NULL)
```

### Sharing e Notifiche
```
project_invitations            notifications (AppNotification)
├── id (PK)                    ├── id (PK)
├── project_id (FK, CASCADE)   ├── user_id (FK, CASCADE)
├── invited_by (FK, CASCADE)   ├── type (task_assigned/status_changed/commented/...)
├── invited_user_id (FK)       ├── title
├── email                      ├── body
├── role (admin/super_user/user) ├── project_id / task_id / epic_id (FK, nullable)
├── token (UNIQUE, 64 char)    ├── is_read (BOOLEAN)
├── status (pending/accepted/declined/expired) ├── read_at
├── expires_at                 ├── sent_telegram / sent_push
├── responded_at               └── created_at
└── created_at

user_project_areas             (organizzazione per-user di progetti in aree)
├── id (PK)
├── user_id (FK, CASCADE)
├── project_id (FK, CASCADE)
├── area_id (FK, SET NULL)
├── created_at
└── updated_at
```

### Report
```
report_configs                 report_history
├── id (PK)                    ├── id (PK)
├── user_id (FK, CASCADE)      ├── config_id (FK, SET NULL)
├── name                       ├── user_id (FK, CASCADE)
├── report_type (person/project/client) ├── report_type
├── frequency (weekly/monthly) ├── title
├── target_user_id / project_id / client_name ├── period_from / period_to
├── is_active (BOOLEAN)        ├── generated_at
├── send_email (BOOLEAN)       ├── file_path / excel_path
├── email_to                   ├── data_json (JSONB)
├── last_sent_at               ├── status / error_message
└── created_at                 └──
```

### Dipendenze Task
```
task_dependencies
├── id (PK)
├── blocking_task_id (FK -> tasks, CASCADE)
├── blocked_task_id (FK -> tasks, CASCADE)
├── dependency_type (blocks/relates_to/duplicates)
├── created_at
├── UNIQUE (blocking_task_id, blocked_task_id)
└── CHECK (blocking_task_id != blocked_task_id)
```

### Automazioni
```
automation_rules
├── id (PK)
├── project_id (FK -> projects, CASCADE)
├── name
├── is_active (BOOLEAN)
├── trigger_type (status_changed/due_date_passed/task_created/all_subtasks_done/assigned_to_changed)
├── trigger_config (JSONB)
├── action_type (change_status/assign_to/create_task/send_notification/set_field)
├── action_config (JSONB)
├── created_at
└── last_triggered
```

### Sprint
```
sprints                        sprint_tasks (association)
├── id (PK)                    ├── sprint_id (FK -> sprints, CASCADE)
├── project_id (FK, CASCADE)   └── task_id (FK -> tasks, CASCADE)
├── name
├── goal
├── start_date / end_date
├── status (planned/active/completed)
└── created_at
```

### Tags, Commenti, Ricorrenze, Abitudini, Template, Pomodoro, Reminder, Push
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

recurrence_rules               task_instances
├── id (PK)                    ├── id (PK)
├── task_id (FK, UNIQUE)       ├── task_id (FK)
├── rrule (TEXT)               ├── due_date
├── workday_adjust (ENUM)      ├── status (todo/done/skip)
├── workday_target (INT)       ├── completed_at
└── next_occurrence            └── completed_by (FK)

habits                         habit_logs
├── id (PK)                    ├── id (PK)
├── name                       ├── habit_id (FK)
├── description                ├── user_id (FK)
├── created_by (FK)            ├── log_date (DATE)
├── frequency_type             ├── value (FLOAT)
├── frequency_days (ARRAY)     └── note
├── times_per_period
├── time_of_day
├── start_date / end_date
├── color / icon
├── position
└── is_archived

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
task_reminders                 ├── user_id (FK)
├── id (PK)                    ├── endpoint
├── task_id / habit_id (FK)    ├── p256dh
├── user_id (FK)               └── auth
├── channel (telegram/email/push/both)
├── offset_minutes
├── sent_at
└── created_at
```

### DB Indexes
- `tasks`: created_by, assigned_to, status, due_date, start_date, parent_id, project_id, heading_id
- `task_reminders`: task_id, user_id, sent_at
- `comments`: task_id
- `areas`: owner_id
- `projects`: area_id, owner_id
- `project_headings`: project_id
- `project_custom_fields`: project_id, UNIQUE(project_id, field_key)
- `task_dependencies`: blocking_task_id, blocked_task_id, UNIQUE(blocking, blocked)
- `automation_rules`: project_id
- `sprints`: project_id
- `epics`: project_id, (project_id + status)
- `time_logs`: task_id, user_id, logged_at, (user_id + logged_at)
- `jira_config`: user_id, sync_enabled
- `report_configs`: user_id, (is_active + frequency)

---

## API Endpoints

### Autenticazione (rate limited: 5/min)
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/auth/register` | Registrazione utente |
| POST | `/api/auth/login` | Login, setta JWT cookie |
| POST | `/api/auth/logout` | Logout, cancella cookie |
| GET | `/api/auth/me` | Profilo utente |
| PATCH | `/api/auth/me/preferences` | Aggiorna preferenze (report, tour, etc.) |
| POST | `/api/auth/me/api-key` | Genera API key |
| DELETE | `/api/auth/me/api-key` | Revoca API key |

### Task (con project access check)
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/tasks/` | Task con filtri (project_id, status, tag_id), ordinati per position, id |
| POST | `/api/tasks/` | Crea task (auto-assign, default oggi) |
| PATCH | `/api/tasks/reorder` | Riordina task via drag-and-drop (array di {id, position}) |
| PATCH | `/api/tasks/{id}` | Aggiorna task (incluso cambio progetto) |
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

### Notifiche In-App
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/notifications/` | Notifiche utente (paginate) |
| PATCH | `/api/notifications/{id}/read` | Segna come letta |
| DELETE | `/api/notifications/{id}` | Elimina notifica |

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

### Aree
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/areas/` | Aree utente con project_count |
| POST | `/api/areas/` | Crea area |
| PATCH | `/api/areas/reorder` | Riordina aree |
| PATCH | `/api/areas/{id}` | Aggiorna area |
| DELETE | `/api/areas/{id}` | Elimina area (progetti spostati a area_id=null) |

### Progetti
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/projects/` | Progetti utente (propri + membro), con task_count |
| POST | `/api/projects/` | Crea progetto (auto-popola campi custom default) |
| GET | `/api/projects/{id}` | Dettaglio progetto |
| PATCH | `/api/projects/{id}` | Aggiorna progetto |
| DELETE | `/api/projects/{id}` | Elimina progetto |
| GET | `/api/projects/{id}/tasks` | Task del progetto |
| GET | `/api/projects/{id}/members` | Membri del progetto |
| POST | `/api/projects/{id}/members` | Aggiungi membro |
| DELETE | `/api/projects/{id}/members/{mid}` | Rimuovi membro |
| GET | `/api/projects/{id}/stats` | Statistiche progetto |

### Headings (sezioni progetto)
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/projects/{id}/headings` | Headings del progetto |
| POST | `/api/projects/{id}/headings` | Crea heading |
| PATCH | `/api/projects/{id}/headings/{hid}` | Aggiorna nome heading |
| DELETE | `/api/projects/{id}/headings/{hid}` | Elimina heading (scollega task) |
| PATCH | `/api/projects/{id}/headings/reorder` | Riordina headings |

### Campi Custom
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/projects/{id}/fields` | Definizioni campi progetto |
| POST | `/api/projects/{id}/fields` | Crea campo custom |
| PATCH | `/api/projects/{id}/fields/{fid}` | Aggiorna campo |
| DELETE | `/api/projects/{id}/fields/{fid}` | Elimina campo |
| PATCH | `/api/projects/{id}/fields/reorder` | Riordina campi |

### Dipendenze Task
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/tasks/{id}/dependencies` | Dipendenze del task (blocking, blocked_by, relates_to) |
| POST | `/api/tasks/{id}/dependencies` | Aggiungi dipendenza (con cycle detection) |
| DELETE | `/api/tasks/dependencies/{did}` | Rimuovi dipendenza |

### Automazioni
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/projects/{id}/automations` | Regole automazione del progetto |
| POST | `/api/projects/{id}/automations` | Crea regola |
| PATCH | `/api/projects/{id}/automations/{aid}` | Aggiorna regola |
| PATCH | `/api/projects/{id}/automations/{aid}/toggle` | Attiva/disattiva regola |
| DELETE | `/api/projects/{id}/automations/{aid}` | Elimina regola |

### Sprint
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/projects/{id}/sprints` | Sprint del progetto |
| POST | `/api/projects/{id}/sprints` | Crea sprint |
| GET | `/api/sprints/{id}` | Dettaglio sprint (tasks + metriche) |
| PATCH | `/api/sprints/{id}` | Aggiorna sprint |
| DELETE | `/api/sprints/{id}` | Elimina sprint |
| POST | `/api/sprints/{id}/tasks/{tid}` | Aggiungi task a sprint |
| DELETE | `/api/sprints/{id}/tasks/{tid}` | Rimuovi task da sprint |

### Epic
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/projects/{id}/epics` | Epic del progetto |
| POST | `/api/projects/{id}/epics` | Crea epic |
| GET | `/api/projects/{id}/epics/{eid}` | Dettaglio epic |
| PATCH | `/api/projects/{id}/epics/{eid}` | Aggiorna epic |
| DELETE | `/api/projects/{id}/epics/{eid}` | Elimina epic |
| PATCH | `/api/projects/{id}/epics/reorder` | Riordina epic |
| POST | `/api/projects/{id}/epics/{eid}/push-jira` | Push epic a Jira |
| GET | `/api/epics/{eid}/time` | Time log dell'epic |
| POST | `/api/epics/{eid}/time` | Crea time log su epic |
| PATCH | `/api/epics/{eid}/time/{lid}` | Modifica time log |
| DELETE | `/api/epics/{eid}/time/{lid}` | Elimina time log |
| GET | `/api/quick-log/epics` | Epic per QuickLog (con timesheet settimanale) |

### Time Logs
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/tasks/{id}/time` | Time log del task |
| POST | `/api/tasks/{id}/time` | Crea time log su task |
| PATCH | `/api/tasks/{id}/time/{lid}` | Modifica time log (minuti, data, nota) |
| DELETE | `/api/tasks/{id}/time/{lid}` | Elimina time log |
| GET | `/api/time/week` | Riepilogo ore settimanale (per giorno, inclusi epic) |
| GET | `/api/time/report` | Report ore con filtri |
| GET | `/api/time/export` | Export time log CSV/JSON |

### Tempo Cloud
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/tempo/users` | Lista utenti Tempo con stats import |
| PATCH | `/api/tempo/users/{uid}` | Link/unlink utente Tempo → Zeno |
| PATCH | `/api/tempo/users/{uid}/deactivate` | Toggle attivo/disattivo utente Tempo |
| POST | `/api/tempo/import` | Trigger import manuale (≤30gg sync, >30gg Celery) |
| GET | `/api/tempo/import/log/{lid}` | Progresso/risultato import |
| POST | `/api/tempo/push` | Trigger push manuale ore → Tempo |
| GET | `/api/tempo/push/log/{lid}` | Progresso/risultato push |
| GET | `/api/tempo/status` | Dashboard stato sync |
| PATCH | `/api/tempo/config` | Aggiorna impostazioni sync |

### Jira
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/jira/config` | Config sync Jira utente |
| POST | `/api/jira/config` | Crea config sync progetto Jira |
| DELETE | `/api/jira/config/{cid}` | Elimina config |
| PATCH | `/api/jira/config/{cid}` | Toggle sync on/off |
| POST | `/api/jira/sync/{cid}` | Trigger sync manuale |
| GET | `/api/jira/users` | Mapping utenti Jira → Zeno |
| PATCH | `/api/jira/users/{mid}` | Aggiorna mapping utente |

### Inviti Progetto
| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/projects/{id}/invite` | Invita utente al progetto |
| GET | `/api/invitations/pending` | Inviti in sospeso per l'utente |
| POST | `/api/invitations/{id}/accept` | Accetta invito e unisciti al progetto |
| DELETE | `/api/invitations/{id}` | Rifiuta/cancella invito |

### Report
| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/reports/configs` | Config report utente |
| POST | `/api/reports/configs` | Crea config report |
| PATCH | `/api/reports/configs/{id}` | Aggiorna config |
| DELETE | `/api/reports/configs/{id}` | Elimina config |
| POST | `/api/reports/generate` | Genera report on-demand |
| GET | `/api/reports/history` | Storico report generati |

---

## Viste Frontend

### 1. Oggi
Task con start_date <= oggi, due_date = oggi, e task scaduti (overdue). Ordinamento per data.

### 2. Prossimi 7 Giorni
Task con scadenza entro 7 giorni + task scaduti. Ordinamento per data.

### 3. Inbox
Area di cattura: task senza progetto e senza date. Elaborali assegnando progetto, data, o archiviando in "Prima o Poi".

### 4. Prima o Poi (Someday)
Task con status `someday`. Parcheggio per task che non si vogliono affrontare ora.

### 5. Calendario
Vista mensile con task posizionati sui giorni. Click per creare task su data specifica.

### 6. Kanban Board
3 colonne (Todo, In Progress, Done) con drag & drop per cambiare stato. Filtro per progetto. Card con priorita, data, tag, subtask progress.

### 7. Matrice di Eisenhower
Griglia 2x2 che mappa le 4 priorita. Ogni quadrante raggruppa i task per scadenza. Drag & drop tra quadranti.

### 8. Abitudini
Lista abitudini con week strip (pallini cliccabili Lun-Dom). Dettaglio con statistiche e calendario mensile.

### 9. Pomodoro
Timer circolare SVG con progress ring (25/5/15 min). Pannello con statistiche e cronologia sessioni.

### 10. Statistiche
Dashboard con completion rate, weekly/monthly charts, habits overview, focus hours.

### 11. Impostazioni
Tab **Generale**: tema, notifiche, Telegram (linking/unlinking), report giornaliero, guided tour, export/import, template, API key, logout.
Tab **Integrazioni**: Tempo (settings, import, users), Jira (config, users).
Tab **Admin**: gestione utenti, backup, Google Calendar, Google Drive.

### 12. Vista Progetto (ProjectView)
Header con nome progetto, badge stato, tipo, descrizione. Barra progresso (task completati / totali).

**Tab Task**: Lista task con headings (sezioni), form creazione inline, drag-and-drop reorder.

**Tab Epic**: Lista epic con icona orologio per registrare ore, Jira key con link, ore totali, stato. Cliccando sulle ore totali si espande la lista dei time log. Log modificabili/eliminabili inline.

**Tab Sprint**: Board sprint con metriche, aggiunta/rimozione task.

**Tab Team**: Membri con ruoli, inviti.

**Pannelli laterali**: Campi Custom, Automazioni (mutuamente esclusivi).

**Gestione stato locale**: Toggle task, aggiunta nuovi task, modifiche dal pannello TaskDetail aggiornano la vista immediatamente senza ricaricare la pagina.

**Pulsanti differenziati**: "Aggiungi task al progetto" (sfondo blu, prominente) vs "Nuova sezione" (stile dashed, icona LayoutList).

### 13. Quick Log (QuickLogView)
Vista a due colonne per il log rapido delle ore sugli epic.

**Colonna sinistra (lista epic)**: Filtro per progetto e ricerca testuale. Ogni epic mostra icona orologio per registrare ore, Jira key con link, ore totali, stato e data ultimo log. Cliccando l'orologio si apre TimeLogForm inline. Header con pulsanti Tempo: "Invia a Tempo" (push) e "Aggiorna da Tempo" (import). Toggle per nascondere la colonna.

**Colonna destra (timesheet settimanale)**: Tabella con navigazione settimanale. Righe per progetto con minuti giornalieri. Totali per giorno e settimana. Barra progresso vs 40h. Click su colonna giorno espande dettaglio con log modificabili/cancellabili (conferma a due step). Toggle per nascondere la colonna.

### 14. Report
Configurazione report periodici (person/project/client, weekly/monthly). Generazione on-demand. Storico con download PDF/Excel.

### 15. Campi Custom
Pannello collassabile in TaskDetail per task con project_id. Input per tipo campo (text, number, date, select, multi_select, boolean, url). Editor definizioni in ProjectView.

### 16. Dipendenze
Pannello in TaskDetail con 3 sezioni: "Blocca", "Bloccato da", "Correlato a". Ricerca task e selettore tipo. Gestione errore 422 per cicli.

### 17. Automazioni
Editor regole con lista toggle, form con trigger/action type dinamici. Configurazione condizionale per tipo.

### 18. Sprint Board
Selettore sprint, form creazione, barra progresso, metriche (task totali, completati, %, giorni rimanenti). Aggiunta/rimozione task, transizioni stato.

### 19. Onboarding (Guided Tour)
Tour guidato step-by-step con spotlight overlay e tooltip posizionati. 6 percorsi tematici: Benvenuto, Organizzazione, Produttivita', Abitudini, Collaborazione, Avanzate. Auto-trigger al primo login, riavviabile da Impostazioni. Specifica completa in `docs/guided-tour-spec.md`.

---

## Celery Beat - Task Periodici

| Task | Schedule | Funzione |
|---|---|---|
| `check_and_send_notifications` | Ogni 60 secondi | Verifica e invia reminder (Telegram + Push) |
| `generate_recurring_instances` | Ogni giorno alle 00:05 | Genera TaskInstance per i prossimi 7 giorni |
| `send_daily_reports` | Ogni 5 minuti | Report giornaliero (email + push + Telegram) |
| `backup_database_to_drive` | Ogni giorno alle 03:00 | pg_dump + gzip + upload Google Drive |
| `send_weekly_time_report` | Venerdi' alle 18:00 | Email report ore settimanale |
| `auto_push_to_tempo` | Ogni notte alle 02:00 | Push time log pendenti Zeno → Tempo |
| `auto_sync_tempo` | Lunedi' alle 06:00 | Import worklogs Tempo → Zeno |
| `send_periodic_reports` (weekly) | Lunedi' alle 07:00 | Report settimanale per config attive |
| `send_periodic_reports` (monthly) | 1° del mese alle 07:00 | Report mensile per config attive |
| `expire_pending_invitations` | Ogni giorno alle 01:00 | Pulisce inviti scaduti |
| `check_due_soon` | Ogni giorno alle 08:00 | Notifica task in scadenza |
| ~~`sync_jira_projects`~~ | ~~Ogni N minuti~~ | ~~Auto-sync Jira~~ (DISABILITATO fino a stabilizzazione) |

Timezone: `Europe/Rome`

---

## Import TickTick

L'endpoint `POST /export/import/ticktick` accetta il CSV di backup di TickTick e importa:

- **Task** con titolo, descrizione, priorita mappata (TT 0→4, 1→1, 3→2, 5→3)
- **Progetti** creati automaticamente dal campo "List Name"
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
