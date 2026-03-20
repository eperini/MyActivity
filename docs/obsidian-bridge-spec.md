# Zeno Obsidian Bridge — Specifiche

Progetto separato per integrare Zeno con Obsidian come companion mobile per la cattura rapida.

**Principio guida**: Zeno resta il task manager. Il bridge aggiunge la capacita' di catturare contenuti da mobile (testo, voce, sketch) e farli confluire nel vault Obsidian, evitando silos informativi.

**Stato**: Specifica iniziale, non implementato.

---

## 1. Il Problema

Obsidian e' un eccellente second brain su desktop ma soffre su mobile:
- Editing markdown scomodo col touch
- Nessun supporto Apple Pencil per appunti/sketch
- Navigazione file macchinosa
- Quick capture lenta (apri app → trova nota → scrivi)

Risultato: le informazioni catturate da mobile finiscono in app separate (GoodNotes, Apple Notes, voice memo) e restano **fuori dal second brain**. Il caso piu' critico: appunti riunione presi con Apple Pencil su iPad che non confluiscono mai nel vault.

## 2. La Soluzione

Un bridge che permette di catturare contenuti da ZenoIOS (iPhone/iPad) e farli confluire automaticamente nel vault Obsidian.

**Flusso**:
```
iPhone/iPad                    Mac Mini                     Tutti i dispositivi
    │                             │                              │
    │  cattura (testo/voce/       │                              │
    │  sketch/foto)               │                              │
    │ ─────── Zeno API ─────────▶ │                              │
    │                             │  Bridge daemon               │
    │                             │  scrive .md + allegati       │
    │                             │  nel vault locale            │
    │                             │ ──── Obsidian Sync ────────▶ │
    │                             │                              │  disponibile
    │                             │                              │  ovunque
```

**Perche' questo approccio**:
- Il Mac Mini e' sempre acceso e ha il vault Obsidian locale
- Le catture vanno prima nel DB Zeno (affidabile, immediato, funziona offline)
- Un daemon sul Mac Mini osserva le nuove catture e le scrive nel vault
- Obsidian Sync distribuisce a tutti i dispositivi
- Nessun plugin Obsidian necessario in fase 1 (semplifica enormemente)

---

## 3. Tipi di Cattura

### 3.1 Quick Note (testo)
- Nota testuale veloce da iPhone/iPad
- Opzionalmente collegabile a un task Zeno o un progetto
- Confluisce nel vault come file .md o append alla daily note

### 3.2 Meeting Notes (Apple Pencil)
**Il caso d'uso principale.**
- Canvas semplice e veloce per scrivere a mano con Apple Pencil su iPad
- NON e' un clone di GoodNotes: niente notebook, niente template complessi. Solo un foglio bianco (o rigato) dove scrivere durante una riunione
- Al salvataggio:
  - L'immagine (PNG) viene salvata nel vault come allegato
  - Viene creata una nota .md con metadata (data, progetto, partecipanti) e embed dell'immagine
  - Opzionale (futuro): OCR/handwriting recognition per estrarre testo cercabile
- Strumenti minimi: penna, evidenziatore, gomma, colori base, undo
- Possibilita' di avere piu' pagine per una singola riunione

### 3.3 Voice Memo
- Registrazione vocale da iPhone
- Trascrizione automatica (Whisper on-device o API)
- Il testo trascritto confluisce nel vault come nota .md
- Audio originale salvato come allegato

### 3.4 Foto/Scan
- Scatto foto o scan documento da iPhone
- Opzionale: OCR per estrarre testo
- Immagine salvata nel vault con nota .md wrapper

---

## 4. Architettura

### 4.1 Componenti

```
┌──────────────────────────────────┐
│          ZenoIOS App             │
│  (nuovo modulo "Capture")        │
│                                  │
│  ┌────────┐ ┌────────┐          │
│  │Quick   │ │Meeting │          │
│  │Note    │ │Canvas  │          │
│  └────┬───┘ └────┬───┘          │
│  ┌────┴───┐ ┌────┴───┐          │
│  │Voice   │ │Photo/  │          │
│  │Memo    │ │Scan    │          │
│  └────┬───┘ └────┬───┘          │
│       └────┬─────┘               │
│            ▼                     │
│     CaptureService               │
│     (queue locale + upload)      │
└────────────┬─────────────────────┘
             │ POST /api/captures
             ▼
┌──────────────────────────────────┐
│        Zeno Backend              │
│  (nuovo modulo captures)         │
│                                  │
│  captures table (DB)             │
│  attachments su filesystem       │
└────────────┬─────────────────────┘
             │ polling o webhook
             ▼
┌──────────────────────────────────┐
│     Obsidian Bridge Daemon       │
│     (processo su Mac Mini)       │
│                                  │
│  - Osserva nuove catture via API │
│  - Scrive .md nel vault          │
│  - Copia allegati in vault       │
│  - Rispetta struttura vault      │
│  - Configura via .env o YAML     │
└──────────────────────────────────┘
             │ filesystem write
             ▼
┌──────────────────────────────────┐
│     Vault Obsidian (locale)      │
│     ~/ObsidianVault/             │
│                                  │
│  Captures/                       │
│  ├── 2026-03-20-riunione.md      │
│  ├── attachments/                │
│  │   ├── meeting-2026-03-20.png  │
│  │   └── voice-2026-03-20.mp3   │
│  Daily Notes/                    │
│  └── 2026-03-20.md  (append)    │
│                                  │
│  ──── Obsidian Sync ──────────▶  │
└──────────────────────────────────┘
```

### 4.2 Nuovo modello: Capture

```python
class CaptureType(str, Enum):
    TEXT = "text"
    MEETING = "meeting"      # Apple Pencil sketch
    VOICE = "voice"          # voice memo
    PHOTO = "photo"          # foto/scan

class CaptureStatus(str, Enum):
    PENDING = "pending"      # in attesa di sync al vault
    SYNCED = "synced"        # scritto nel vault
    ERROR = "error"          # errore di sync

class Capture(Base):
    id: int                  # PK
    user_id: int             # FK -> users
    capture_type: CaptureType
    title: str               # titolo o prima riga
    content: str | None      # testo markdown (per text e voice transcript)
    project_id: int | None   # FK -> projects (opzionale)
    task_id: int | None      # FK -> tasks (opzionale)
    tags: list[str]          # tag come JSON array
    metadata: dict           # JSONB: partecipanti, durata, location, etc.
    vault_path: str | None   # path relativo nel vault dove e' stato scritto
    vault_status: CaptureStatus
    vault_synced_at: datetime | None
    created_at: datetime
    updated_at: datetime

class CaptureAttachment(Base):
    id: int
    capture_id: int          # FK -> captures
    filename: str            # nome file originale
    file_type: str           # image/png, audio/m4a, etc.
    file_size: int           # bytes
    storage_path: str        # path su filesystem del server
    vault_path: str | None   # path relativo nel vault
    created_at: datetime
```

### 4.3 API Endpoints

| Metodo | Path | Descrizione |
|---|---|---|
| POST | `/api/captures/` | Crea cattura (multipart: JSON + file allegati) |
| GET | `/api/captures/` | Lista catture utente (con filtri) |
| GET | `/api/captures/{id}` | Dettaglio cattura |
| PATCH | `/api/captures/{id}` | Aggiorna (titolo, tag, progetto) |
| DELETE | `/api/captures/{id}` | Elimina cattura + allegati |
| POST | `/api/captures/{id}/transcribe` | Trigger trascrizione voice memo |

### 4.4 Bridge Daemon

Processo Python leggero che gira sul Mac Mini. Repository separato: `ZenoBridge`.

**Configurazione** (`config.yaml`):
```yaml
zeno_api_url: "http://localhost:8000/api"
zeno_api_key: "..."
vault_path: "/Users/perini/ObsidianVault"
poll_interval_seconds: 30

# Dove scrivere nel vault
paths:
  captures: "Captures"           # cartella per note catturate
  attachments: "Captures/attachments"  # allegati
  daily_notes: "Daily Notes"     # per append a daily note

# Template per le note generate
templates:
  meeting: |
    ---
    date: {{date}}
    type: meeting
    project: {{project}}
    participants: {{participants}}
    tags: {{tags}}
    ---
    # {{title}}

    ![[{{attachment_filename}}]]

    {{transcription}}

  text: |
    ---
    date: {{date}}
    type: capture
    project: {{project}}
    tags: {{tags}}
    ---
    # {{title}}

    {{content}}
```

**Logica**:
1. Polling: ogni 30s chiama `GET /api/captures/?vault_status=pending`
2. Per ogni cattura:
   - Scarica allegati dal backend
   - Copia allegati nella cartella vault configurata
   - Genera file .md dal template
   - Scrive il .md nel vault
   - Opzionale: appende un link alla daily note del giorno
   - Chiama `PATCH /api/captures/{id}` per aggiornare `vault_status = synced`
3. Obsidian Sync si occupa della distribuzione

---

## 5. Meeting Canvas (iPad)

### 5.1 Esperienza utente

```
┌──────────────────────────────────────────────┐
│ ← Riunione Sprint Planning        [Salva ✓] │
│                                              │
│  Progetto: [Vision-e ▼]   Tag: [+]          │
│  Partecipanti: [Marco, Luca, ...]           │
│──────────────────────────────────────────────│
│                                              │
│           (canvas Apple Pencil)              │
│                                              │
│     area di scrittura libera                 │
│     con scroll verticale infinito            │
│                                              │
│                                              │
│                                              │
│──────────────────────────────────────────────│
│ [✏️ Penna] [🖍 Evidenz.] [⬜ Gomma] [↩ Undo]  │
│ [Nero] [Blu] [Rosso] [Verde]    Pag 1/1 [+] │
└──────────────────────────────────────────────┘
```

### 5.2 Specifiche tecniche

**Framework**: PencilKit (nativo Apple)
- `PKCanvasView` per il canvas
- `PKToolPicker` per la toolbar strumenti
- Salvataggio come `PKDrawing` (per editing futuro) + export PNG (per vault)
- Supporto pressure sensitivity e tilt

**Strumenti**:
- Penna (pen): larghezze 1-5pt, 4 colori (nero, blu, rosso, verde)
- Evidenziatore (marker): semi-trasparente, stesso set colori
- Gomma: pixel e oggetto
- Lasso: selezione e spostamento
- Undo/redo illimitato

**Pagine**:
- Multi-pagina per riunioni lunghe
- Ogni pagina e' un canvas separato
- Al salvataggio: una immagine PNG per pagina, tutte embeddate nella nota .md

**Sfondo**: bianco, rigato, quadretti (selezionabile nelle impostazioni)

**Performance**: PencilKit e' ottimizzato da Apple, latenza minima. Nessuna lib esterna necessaria.

### 5.3 Salvataggio

Al tap su "Salva":
1. Ogni pagina → export PNG (alta risoluzione, ~2x)
2. `PKDrawing` serializzato e salvato nel DB Zeno (per poter riaprire e modificare)
3. Upload allegati + creazione Capture via API
4. Il bridge daemon scrive nel vault:

```markdown
---
date: 2026-03-20
type: meeting
project: Vision-e
participants: [Marco, Luca]
tags: [sprint-planning]
---
# Riunione Sprint Planning

## Pagina 1
![[meeting-2026-03-20-sprint-p1.png]]

## Pagina 2
![[meeting-2026-03-20-sprint-p2.png]]
```

---

## 6. Quick Note

### 6.1 iPhone

- Apertura rapida: widget iOS / Action Button / share extension
- Campo testo con toolbar markdown semplificata (bold, list, link)
- Selettore progetto/task opzionale
- Tag rapidi
- "Invia" → API → vault

### 6.2 iPad

- Stessa interfaccia ma con opzione "Scrivi a mano" che apre un mini canvas
- L'handwriting viene salvato come immagine inline nella nota

---

## 7. Voice Memo

### 7.1 Flusso

1. Tap su "Registra" (o Shortcut/Action Button)
2. Registrazione audio (AVAudioRecorder, formato m4a)
3. Al termine: trascrizione automatica
4. Review: l'utente vede testo trascritto, puo' editare
5. Salvataggio: testo come content, audio come allegato

### 7.2 Trascrizione

**Fase 1**: Apple Speech Framework (on-device, gratuito, italiano supportato)
- Pro: nessun costo, privacy, funziona offline
- Contro: qualita' inferiore su audio lungo o rumoroso

**Fase 2 (opzionale)**: Whisper API (OpenAI) come fallback
- Migliore qualita', ma richiede API key e connessione
- Configurabile dall'utente nelle impostazioni

---

## 8. Integrazione con Daily Note

Il bridge daemon puo' appendere automaticamente alla daily note di Obsidian un riepilogo delle catture del giorno.

**Esempio append**:
```markdown
## Catture del giorno
- 09:30 — 📝 [[Captures/idea-nuovo-report|Idea nuovo report]]
- 10:00 — ✏️ [[Captures/2026-03-20-sprint-planning|Riunione Sprint Planning]]
- 14:15 — 🎤 [[Captures/voice-feedback-cliente|Feedback cliente]]
```

Configurabile: on/off, posizione nel file (top/bottom), formato.

---

## 9. Fase 1 — MVP

Obiettivo: validare l'integrazione con il minimo sforzo.

### Scope

| Feature | In scope | Note |
|---|---|---|
| Quick Note (testo) | Si | iPhone + iPad |
| Meeting Canvas (Apple Pencil) | Si | iPad only, la feature killer |
| Voice Memo + trascrizione | No | Fase 2 |
| Foto/Scan | No | Fase 2 |
| Bridge daemon | Si | Polling semplice |
| Append a daily note | Si | Opzionale |
| OCR/handwriting recognition | No | Fase 3 |
| Consultazione vault | No | Fase 3 |

### Componenti da sviluppare

**Repository: ZenoBridge** (Python)
- Bridge daemon (polling + write vault)
- Configurazione YAML
- Template note .md
- Gestione allegati

**Repository: ZenoIOS** (modulo aggiuntivo)
- Tab/sezione "Capture" nella navigazione
- Quick Note view
- Meeting Canvas view (PencilKit)
- CaptureService (queue locale + upload)

**Repository: myActivity** (backend, estensione)
- Modello Capture + CaptureAttachment
- Route API /captures
- Storage allegati su filesystem

### Validazione

L'MVP e' riuscito se:
1. Posso prendere appunti con Apple Pencil durante una riunione su iPad
2. Entro 1 minuto dal salvataggio, la nota con lo sketch appare nel vault Obsidian
3. Posso catturare una nota testuale veloce da iPhone e ritrovarla nel vault
4. Le catture sono collegate a progetti Zeno (tracciabilita')

---

## 10. Fasi successive

### Fase 2 — Capture avanzato
- Voice memo con trascrizione (Apple Speech + Whisper opzionale)
- Foto/scan con OCR
- Share extension iOS (cattura da qualsiasi app)
- Widget iOS per quick capture
- Action Button configurabile

### Fase 3 — Consultazione vault
- Navigazione vault read-only da ZenoIOS
- Ricerca full-text nelle note
- Visualizzazione note con rendering markdown
- Graph view semplificata (opzionale)

### Fase 4 — Bidirezionale
- Plugin Obsidian per sync task Zeno ↔ checkbox markdown
- Modifica note dal mobile → sync al vault
- Creazione task da note Obsidian
