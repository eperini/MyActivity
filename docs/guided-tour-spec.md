# Zeno - Guida Interattiva (Tour Guidato)

Specifica tecnica e di design per il sistema di onboarding interattivo.

---

## 1. Obiettivo

Fornire ai nuovi utenti (e a quelli esistenti che vogliono scoprire funzionalità) un tour guidato step-by-step che mostri le funzionalità di Zeno con spotlight, tooltip e azioni interattive.

### Quando si attiva
- **Primo accesso**: automaticamente dopo il primo login (flag `has_seen_tour` nel profilo utente)
- **Su richiesta**: da Impostazioni > tab "Generale" > pulsante "Rivedi la guida"
- **Per percorso**: pannello "Guida" con i singoli percorsi tematici selezionabili

---

## 2. Architettura

### 2.1 Nuovi file

```
frontend/src/components/onboarding/
  OnboardingProvider.tsx     # Context provider + state machine
  SpotlightOverlay.tsx       # Overlay scuro con cutout sull'elemento target
  TourTooltip.tsx            # Tooltip posizionato con contenuto dello step
  TourLauncher.tsx           # Pannello di selezione percorsi (in Settings)
  tours/
    index.ts                 # Export tutti i tour
    welcome.ts               # Tour "Benvenuto"
    organization.ts          # Tour "Organizzazione"
    productivity.ts          # Tour "Produttivita'"
    habits.ts                # Tour "Abitudini"
    collaboration.ts         # Tour "Collaborazione"
    advanced.ts              # Tour "Funzionalita' Avanzate"
```

### 2.2 File modificati

| File | Modifica |
|------|----------|
| `Providers.tsx` | Wrappa con `<OnboardingProvider>` |
| `page.tsx` | Avvia tour al primo accesso, aggiunge attributi `data-tour` |
| `Sidebar.tsx` | Aggiunge attributi `data-tour` ai nav items e sezioni |
| `AddTaskForm.tsx` | Aggiunge `data-tour="add-task-form"` |
| `TaskDetail.tsx` | Aggiunge `data-tour` a sezioni chiave |
| `TaskListView.tsx` | Aggiunge `data-tour="task-list"` |
| `ProjectView.tsx` | Aggiunge `data-tour` a headings, epics, members tabs |
| `KanbanView.tsx` | Aggiunge `data-tour="kanban-board"` |
| `EisenhowerMatrix.tsx` | Aggiunge `data-tour="eisenhower"` |
| `PomodoroTimer.tsx` | Aggiunge `data-tour="pomodoro-timer"` |
| `HabitListView.tsx` | Aggiunge `data-tour` a elementi chiave |
| `SettingsView.tsx` | Aggiunge tab/sezione "Guida" con TourLauncher |
| `BottomTabBar.tsx` | Aggiunge `data-tour` ai tab mobile |

### 2.3 Backend

| File | Modifica |
|------|----------|
| `models/user.py` | Aggiunge campo `has_seen_tour: bool = False` |
| `routes/auth.py` | Ritorna `has_seen_tour` in `/me` |
| Migration | Nuova: `ADD COLUMN has_seen_tour BOOLEAN DEFAULT FALSE` |

---

## 3. Componenti

### 3.1 OnboardingProvider

```tsx
interface OnboardingState {
  isActive: boolean;           // tour in corso
  currentTourId: string;       // "welcome" | "organization" | ...
  currentStepIndex: number;    // indice step corrente
  completedTours: string[];    // tour completati (localStorage)
}

interface OnboardingContextValue {
  state: OnboardingState;
  startTour: (tourId: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  endTour: () => void;
  isStepActive: (tourId: string, stepIndex: number) => boolean;
}
```

**Comportamento:**
- Persiste `completedTours` in `localStorage` (chiave `zeno_completed_tours`)
- Al mount, controlla se `has_seen_tour === false` e avvia automaticamente il tour "welcome"
- Al completamento del tour "welcome", chiama `PATCH /api/auth/preferences` per settare `has_seen_tour = true`
- Se l'utente fa skip, non rimostra automaticamente ma resta disponibile in Settings

### 3.2 SpotlightOverlay

Overlay fullscreen (`fixed inset-0 z-[60]`) con:
- Background `bg-black/70` con transizione opacity
- **Cutout** sull'elemento target via CSS `clip-path` calcolato dal `getBoundingClientRect()` dell'elemento
- Padding di 8px attorno al cutout per respiro visivo
- Click fuori dal tooltip = skip (con conferma)
- Transizione smooth quando si cambia step (cutout si sposta con animazione)

```
+--------------------------------------------------+
|                  overlay scuro                    |
|                                                   |
|         +------------------+                      |
|         |   [elemento]     |  <-- area illuminata |
|         +------------------+                      |
|              |  tooltip  |                        |
|              +----------+                         |
|                                                   |
+--------------------------------------------------+
```

### 3.3 TourTooltip

Tooltip posizionato dinamicamente rispetto all'elemento target.

**Layout:**
```
+----------------------------------------+
| [icona] Titolo dello step        2 / 6 |
|                                        |
| Descrizione dello step con testo       |
| che spiega la funzionalita'.           |
|                                        |
|  [Indietro]        [Salta]  [Avanti>] |
+----------------------------------------+
         |  (freccia verso il target)
```

**Proprietà:**
- Max width: 380px (desktop), 100% - 32px (mobile)
- Posizionamento: `top` | `bottom` | `left` | `right` (auto-calcolato, con override per step)
- Freccia CSS che punta all'elemento target
- Stile coerente con il design system Zeno (zinc-900, border zinc-700, text bianco)
- Animazione: `animate-scale-in` esistente

**Mobile:**
- Il tooltip diventa un bottom sheet fisso (ancorato in basso)
- Lo spotlight resta ma il tooltip e' sempre in fondo allo schermo
- Swipe left/right per navigare gli step

---

## 4. Definizione Step

### 4.1 Interfaccia

```tsx
interface TourStep {
  // Targeting
  target: string;                    // CSS selector (data-tour attribute)

  // Contenuto
  title: string;
  content: string;
  icon?: string;                     // nome icona Lucide (opzionale)

  // Posizionamento
  placement?: "top" | "bottom" | "left" | "right" | "auto";

  // Navigazione
  beforeShow?: () => void;           // azione prima di mostrare (es. navigare a una view)
  action?: "click" | "observe";      // "click" = aspetta che l'utente clicchi il target
                                     // "observe" = mostra e basta

  // Condizioni
  waitForSelector?: string;          // attendi che questo selector esista nel DOM
  highlightPadding?: number;         // override padding spotlight (default 8px)
}

interface Tour {
  id: string;
  name: string;
  description: string;
  icon: string;                      // icona Lucide per il pannello di selezione
  steps: TourStep[];
  estimatedMinutes: number;          // durata stimata
}
```

### 4.2 Navigazione automatica

Alcuni step richiedono di essere in una view specifica. Il campo `beforeShow` gestisce questo:

```ts
{
  target: '[data-tour="kanban-board"]',
  title: "Kanban Board",
  content: "...",
  beforeShow: () => {
    // Il provider chiama onSelectView("kanban") tramite un callback
    // registrato da page.tsx
  }
}
```

Il provider espone un `registerNavigator(fn)` che page.tsx usa per collegare `setSelectedView`.

---

## 5. Percorsi (Tour)

### 5.1 Benvenuto (welcome) — ~2 min, 7 step

Tour iniziale obbligatorio che copre le basi.

| # | Target | Titolo | Contenuto | Azione |
|---|--------|--------|-----------|--------|
| 1 | `[data-tour="sidebar"]` | Benvenuto in Zeno! | Questa e' la tua barra laterale. Da qui navighi tra le viste, i progetti e le impostazioni. | observe |
| 2 | `[data-tour="nav-today"]` | Oggi | La tua vista principale. Mostra i task in scadenza oggi e quelli con data di inizio oggi o precedente. | observe |
| 3 | `[data-tour="nav-inbox"]` | Inbox | L'area di cattura. Ogni task senza progetto e senza date finisce qui. Elaborali quando sei pronto: assegna un progetto, una data, o archiviali in "Prima o Poi". | observe |
| 4 | `[data-tour="sidebar-projects"]` | Aree e Progetti | Organizza il lavoro in Aree (macro-categorie) e Progetti. Clicca su un progetto per vedere i suoi task. | observe |
| 5 | `[data-tour="add-task-btn"]` | Crea un Task | Premi qui (o il tasto N) per creare un nuovo task. Puoi assegnare progetto, priorita', scadenza e tag. | click |
| 6 | `[data-tour="add-task-form"]` | Quick Add | Scrivi il titolo e conferma. Puoi anche usare la sintassi rapida: `#tag`, `!1` per priorita', `>domani` per la scadenza. | observe |
| 7 | `[data-tour="nav-settings"]` | Impostazioni | Da qui configuri tema, notifiche, integrazioni e puoi sempre rivedere questa guida. Buon lavoro! | observe |

### 5.2 Organizzazione (organization) — ~2 min, 5 step

| # | Target | Titolo | Contenuto | beforeShow |
|---|--------|--------|-----------|------------|
| 1 | `[data-tour="sidebar-projects"]` | La struttura | Zeno usa il modello Area > Progetto > Task, ispirato a Things 3. Le Aree raggruppano i progetti per contesto (Lavoro, Personale...). | — |
| 2 | `[data-tour="sidebar-new-area"]` | Crea un'Area | Clicca qui per creare la tua prima area. | observe |
| 3 | `[data-tour="sidebar-new-project"]` | Crea un Progetto | Dentro ogni area puoi creare progetti. Ogni progetto ha i suoi task, le sue sezioni (headings) e il suo team. | observe |
| 4 | `[data-tour="project-headings"]` | Sezioni (Headings) | All'interno di un progetto puoi creare sezioni per organizzare i task in gruppi logici, come in Things 3. | navigare a un progetto |
| 5 | `[data-tour="nav-someday"]` | Prima o Poi | I task che non vuoi affrontare ora ma non vuoi perdere. Cambiane lo stato a "someday" e ritrovali qui. | — |

### 5.3 Produttivita' (productivity) — ~2 min, 5 step

| # | Target | Titolo | Contenuto | beforeShow |
|---|--------|--------|-----------|------------|
| 1 | `[data-tour="kanban-board"]` | Kanban | Trascina i task tra le colonne Todo, In Corso e Fatto. Visione d'insieme del flusso di lavoro. | view: kanban |
| 2 | `[data-tour="eisenhower"]` | Matrice di Eisenhower | Classifica i task per urgenza e importanza. I 4 quadranti ti aiutano a decidere cosa fare prima, delegare o eliminare. | view: eisenhower |
| 3 | `[data-tour="pomodoro-timer"]` | Pomodoro | Sessioni di focus da 25 minuti seguite da pause. Dopo 4 pomodori hai una pausa lunga. Le sessioni vengono salvate nelle statistiche. | view: pomodoro |
| 4 | `[data-tour="nav-timereport"]` | Report Ore | Tieni traccia del tempo lavorato su ogni task. Vedi il report settimanale ed esporta in CSV. | — |
| 5 | `[data-tour="nav-stats"]` | Statistiche | Dashboard con task completati, streak, trend mensili, distribuzione per priorita' e per progetto. | — |

### 5.4 Abitudini (habits) — ~1.5 min, 4 step

| # | Target | Titolo | Contenuto | beforeShow |
|---|--------|--------|-----------|------------|
| 1 | `[data-tour="nav-habits"]` | Abitudini | Traccia le abitudini quotidiane o settimanali. Ogni abitudine ha frequenza, colore e statistiche. | — |
| 2 | `[data-tour="habit-list"]` | La lista | Vedi tutte le abitudini attive con lo stato di oggi. Clicca per segnare come fatto. | view: habits |
| 3 | `[data-tour="habit-add-btn"]` | Nuova abitudine | Crea un'abitudine con nome, frequenza (giornaliera, settimanale) e colore. | observe |
| 4 | `[data-tour="habit-stats"]` | Streak e statistiche | Per ogni abitudine vedi: tasso di completamento, streak attuale e riepilogo mensile. | observe |

### 5.5 Collaborazione (collaboration) — ~1.5 min, 4 step

| # | Target | Titolo | Contenuto | beforeShow |
|---|--------|--------|-----------|------------|
| 1 | `[data-tour="project-members-tab"]` | Team di progetto | Ogni progetto puo' avere piu' membri con ruoli diversi: Admin, Super User, User, Viewer. | navigare a un progetto, tab team |
| 2 | `[data-tour="project-invite"]` | Invita membri | Invita via email. Il destinatario riceve una notifica e puo' accettare o rifiutare. | observe |
| 3 | `[data-tour="task-assign"]` | Assegna task | Nel dettaglio task, scegli a chi assegnarlo tra i membri del progetto. | observe |
| 4 | `[data-tour="task-comments"]` | Commenti | Ogni task ha una sezione commenti per discutere con il team. | observe |

### 5.6 Funzionalita' Avanzate (advanced) — ~2 min, 5 step

| # | Target | Titolo | Contenuto | beforeShow |
|---|--------|--------|-----------|------------|
| 1 | `[data-tour="task-recurrence"]` | Ricorrenze | Imposta task ricorrenti: giornalieri, settimanali, mensili. Supporto completo RRULE. | observe (nel TaskDetail) |
| 2 | `[data-tour="task-dependencies"]` | Dipendenze | Dichiara che un task blocca o e' bloccato da un altro. Utile per flussi complessi. | observe |
| 3 | `[data-tour="project-automations"]` | Automazioni | Regole if-then: quando un task cambia stato, assegnalo, creane un altro, invia notifica... | navigare a un progetto |
| 4 | `[data-tour="project-sprints"]` | Sprint | Iterazioni a tempo per organizzare il lavoro in cicli. Imposta date e obiettivi. | observe |
| 5 | `[data-tour="settings-integrations"]` | Integrazioni | Collega Jira, Google Calendar e Tempo per sincronizzare task e ore lavorate. | view: settings |

---

## 6. Design visivo

### 6.1 Colori

| Elemento | Light mode | Dark mode |
|----------|-----------|-----------|
| Overlay | `rgba(0,0,0,0.70)` | `rgba(0,0,0,0.80)` |
| Tooltip bg | `#ffffff` | `#18181b` (zinc-900) |
| Tooltip border | `#e4e4e7` (zinc-200) | `#3f3f46` (zinc-700) |
| Tooltip text | `#09090b` (zinc-950) | `#ffffff` |
| Testo secondario | `#71717a` (zinc-500) | `#a1a1aa` (zinc-400) |
| Pulsante primario | `#3b82f6` (blue-500) | `#3b82f6` |
| Progress dots attivo | `#3b82f6` | `#3b82f6` |
| Progress dots inattivo | `#d4d4d8` (zinc-300) | `#52525b` (zinc-600) |

### 6.2 Animazioni

- **Spotlight transition**: `transition: clip-path 0.3s ease-in-out`
- **Tooltip enter**: `animate-scale-in` (0.15s, gia' definita in globals.css)
- **Tooltip exit**: opacity 0 in 0.1s
- **Step change**: tooltip fa fade-out (0.1s), spotlight si muove (0.3s), tooltip fa scale-in (0.15s)

### 6.3 Responsive

**Desktop (>768px):**
- Tooltip posizionato accanto al target (top/bottom/left/right)
- Max width 380px
- Freccia CSS verso il target

**Mobile (<=768px):**
- Tooltip come bottom sheet fisso (h-auto, max 50vh)
- Ancorato al bottom con rounded-t-xl
- Spotlight ancora visibile sopra
- Navigazione: pulsanti + swipe orizzontale
- Nessuna freccia

---

## 7. Pannello Guida (TourLauncher)

Nuovo componente mostrato in Settings > tab "Generale", sezione in fondo.

```
+--------------------------------------------------+
|  Guida interattiva                                |
|                                                   |
|  +--------------------------------------------+  |
|  | [Play] Benvenuto              ~2 min    [v] |  |
|  +--------------------------------------------+  |
|  | [Folder] Organizzazione       ~2 min       |  |
|  +--------------------------------------------+  |
|  | [Zap] Produttivita'           ~2 min       |  |
|  +--------------------------------------------+  |
|  | [Star] Abitudini              ~1.5 min     |  |
|  +--------------------------------------------+  |
|  | [Users] Collaborazione        ~1.5 min     |  |
|  +--------------------------------------------+  |
|  | [Settings] Avanzate           ~2 min       |  |
|  +--------------------------------------------+  |
|                                                   |
|  [v] = completato (check verde)                   |
+--------------------------------------------------+
```

Ogni riga e' cliccabile e avvia il rispettivo tour. I tour completati mostrano un check.

---

## 8. Persistenza

| Dato | Dove | Perche' |
|------|------|---------|
| `has_seen_tour` | DB (User model) | Serve cross-device per non rimostrare il tour welcome |
| `completedTours` | localStorage (`zeno_completed_tours`) | I percorsi opzionali sono per device, bassa criticita' |
| `currentStep` | React state | Non serve persistere, se chiudi perdi il progresso |

---

## 9. Accessibilita'

- **Focus trap** nel tooltip quando il tour e' attivo
- **aria-live="polite"** sul tooltip per screen reader
- **Escape** chiude il tour (con conferma se non e' l'ultimo step)
- **Tab** naviga tra i pulsanti del tooltip
- **aria-describedby** sull'elemento target che punta al tooltip
- Contrasto colori conforme WCAG 2.1 AA

---

## 10. Edge case

| Caso | Comportamento |
|------|---------------|
| Elemento target non trovato nel DOM | Salta lo step con un console.warn |
| Resize finestra durante il tour | Ricalcola posizione spotlight + tooltip (ResizeObserver) |
| Navigazione a un'altra pagina (es. login) | Termina il tour |
| Tour avviato su mobile con sidebar chiusa | Lo step con `beforeShow` apre la sidebar prima di mostrare lo step |
| Utente clicca fuori durante step "click" | Non succede nulla, deve cliccare il target |
| Scroll necessario per vedere il target | `scrollIntoView({ behavior: 'smooth', block: 'center' })` prima di mostrare lo step |

---

## 11. Fasi di implementazione

### Fase 1: Infrastruttura (~3-4h)
- `OnboardingProvider` con state machine
- `SpotlightOverlay` con clip-path
- `TourTooltip` con posizionamento
- Integrazione in `Providers.tsx`
- Attributi `data-tour` sui componenti principali

### Fase 2: Tour "Benvenuto" (~2h)
- Definizione 7 step del tour welcome
- Trigger automatico al primo login
- `has_seen_tour` nel backend
- Migrazione DB

### Fase 3: Tour tematici (~2-3h)
- 5 tour aggiuntivi (organization, productivity, habits, collaboration, advanced)
- Navigazione automatica tra view
- TourLauncher in Settings

### Fase 4: Mobile + Polish (~1-2h)
- Bottom sheet su mobile
- Swipe navigation
- Test su vari screen size
- Animazioni finali

---

## 12. Dipendenze

Zero nuove dipendenze npm. Tutto custom con:
- React Context (gia' usato: Toast, Theme)
- CSS clip-path per spotlight
- `getBoundingClientRect()` + `ResizeObserver` per posizionamento
- Lucide icons (gia' installato)
- Tailwind CSS (gia' installato)
