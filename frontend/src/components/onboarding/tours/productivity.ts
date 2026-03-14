import type { Tour } from "../types";
import { navigateTo } from "./helpers";

export const productivityTour: Tour = {
  id: "productivity",
  name: "Produttivita'",
  description: "Kanban, Eisenhower, Pomodoro e Report per lavorare meglio.",
  icon: "Zap",
  estimatedMinutes: 2,
  steps: [
    {
      target: '[data-tour="nav-kanban"]',
      title: "Kanban",
      content:
        "Trascina i task tra le colonne Todo, In Corso e Fatto. Visione d'insieme del flusso di lavoro.",
      placement: "right",
      beforeShow: () => navigateTo("kanban"),
    },
    {
      target: '[data-tour="nav-eisenhower"]',
      title: "Matrice di Eisenhower",
      content:
        "Classifica i task per urgenza e importanza. I 4 quadranti ti aiutano a decidere cosa fare prima, delegare o eliminare.",
      placement: "right",
      beforeShow: () => navigateTo("eisenhower"),
    },
    {
      target: '[data-tour="nav-pomodoro"]',
      title: "Pomodoro",
      content:
        "Sessioni di focus da 25 minuti seguite da pause. Dopo 4 pomodori hai una pausa lunga. Le sessioni vengono salvate nelle statistiche.",
      placement: "right",
      beforeShow: () => navigateTo("pomodoro"),
    },
    {
      target: '[data-tour="nav-timereport"]',
      title: "Report Ore",
      content:
        "Tieni traccia del tempo lavorato su ogni task. Vedi il report settimanale ed esporta in CSV.",
      placement: "right",
    },
    {
      target: '[data-tour="nav-stats"]',
      title: "Statistiche",
      content:
        "Dashboard con task completati, streak, trend mensili, distribuzione per priorita' e per progetto.",
      placement: "right",
    },
  ],
};
