# Zeno — Stima ore/uomo sviluppo

Data stima: 16 marzo 2026

## Dimensioni del progetto

| Metrica | Valore |
|---------|--------|
| Righe di codice totali | ~32.000 (14k backend Python, 18k frontend TypeScript) |
| File totali | 245 (86 .py, 71 .tsx/.ts) |
| Modelli database | 33 |
| File route API | 32 |
| Componenti React | 46 |
| File di test | 236 (unit, integration, E2E) |
| Commit | 60 |
| Documentazione architetturale | 921 righe |

## Breakdown per area

| Area | Ore stimate | Note |
|------|-------------|------|
| Architettura e setup (Docker, DB, auth JWT, CORS, Tailscale) | 40–50h | Infrastruttura completa con Docker Compose, PostgreSQL, Redis, Celery |
| Backend core (modelli, CRUD, API REST) | 80–100h | 33 modelli, 32 file di route, validazione Pydantic, async SQLAlchemy |
| Frontend core (layout, routing, componenti base) | 60–80h | Next.js 14, Tailwind CSS, layout responsive desktop/mobile |
| Task management (subtask, template, ricorrenze, priorità, tag) | 50–60h | Ricorrenze complesse (workday adjust), template con subtask, natural language quick-add |
| Progetti e Aree (v2 refactor, heading, campi custom, automazioni, sprint) | 60–70h | Refactor completo da Liste a Progetti, motore automazioni, sprint board |
| Time tracking + Tempo/Jira (sync bidirezionale, import/export) | 60–80h | Integrazione API Tempo v4 e Jira REST, ghost users, risoluzione account ID |
| Report e statistiche (PDF/Excel, heatmap, dashboard, weekly timesheet) | 30–40h | Generazione report server-side, grafici frontend, raggruppamento per progetto/task/giorno |
| Sharing e notifiche (multi-user, inviti, reminder, push, email, Telegram) | 40–50h | Sistema inviti con token, notifiche multi-canale, bot Telegram interattivo |
| UX polish (drag & drop, Eisenhower, Kanban, Pomodoro, calendario, shortcuts, guided tour) | 50–60h | dnd-kit, viste multiple, keyboard shortcuts, onboarding guidato |
| PWA e mobile (responsive, service worker, Action Button) | 15–20h | Progressive Web App, layout adattivo, supporto iPhone Action Button |
| Backup e infra (Google Drive backup, import/export, TickTick CSV) | 15–20h | Backup automatico schedulato, import dati da TickTick |
| Testing (unit, integration, E2E Playwright) | 40–50h | 236 file di test, copertura backend + frontend + browser |
| Code review, bug fix, sicurezza | 30–40h | OWASP hardening, fix vulnerabilità, review iterative |
| Documentazione | 10–15h | ARCHITECTURE.md (921 righe), specifiche funzionali, guided tour spec |

## Stima totale

| Scenario | Ore totali | Durata (full-time) |
|----------|------------|---------------------|
| Senior developer (stack noto, decisioni rapide) | 550–700h | 3–4 mesi |
| Developer mid-level (più esplorazione e ricerca) | 800–1.000h | 5–6 mesi |
| Team 2 persone (frontend + backend dedicati) | 400–500h cad. | 2,5–3 mesi |

## Stack tecnologico

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2 (async), PostgreSQL, Redis, Celery
- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Infrastruttura**: Docker Compose, Tailscale, Google Drive backup
- **Integrazioni**: Jira REST API, Tempo v4 API, Google Calendar, Telegram Bot, Web Push, SMTP
- **Testing**: Pytest, Vitest, React Testing Library, Playwright

## Considerazioni

La stima tiene conto di:

- **Complessità delle integrazioni esterne**: Jira, Tempo, Google Calendar e Telegram richiedono gestione di autenticazione, rate limiting, mapping dati e gestione errori specifica per ciascuna API.
- **Architettura completa**: Non si tratta di un prototipo ma di un sistema production-ready con Docker, backup automatici, multi-user, notifiche multi-canale e sicurezza.
- **Ricchezza dell'interfaccia**: 46 componenti React con viste multiple (lista, Kanban, Eisenhower, calendario, Pomodoro), drag & drop, responsive design e PWA.
- **Copertura test**: Suite di test completa su tre livelli (unit, integration, E2E) che aggiunge overhead significativo ma garantisce stabilità.

La stima più realistica per un **singolo sviluppatore senior full-stack** è di circa **600–700 ore**, equivalenti a circa **4 mesi full-time**.
