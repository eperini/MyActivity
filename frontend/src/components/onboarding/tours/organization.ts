import type { Tour } from "../types";
import { navigateTo } from "./helpers";

export const organizationTour: Tour = {
  id: "organization",
  name: "Organizzazione",
  description: "Impara ad organizzare il lavoro con Aree, Progetti e Sezioni.",
  icon: "FolderOpen",
  estimatedMinutes: 2,
  steps: [
    {
      target: '[data-tour="sidebar-projects"]',
      title: "La struttura",
      content:
        "Zeno usa il modello Area > Progetto > Task, ispirato a Things 3. Le Aree raggruppano i progetti per contesto (Lavoro, Personale...).",
      placement: "right",
    },
    {
      target: '[data-tour="sidebar-new-area"]',
      title: "Crea un'Area",
      content:
        "Clicca qui per creare la tua prima area. Ogni area ha un colore e contiene uno o piu' progetti.",
      placement: "right",
    },
    {
      target: '[data-tour="sidebar-new-project"]',
      title: "Crea un Progetto",
      content:
        "Dentro ogni area puoi creare progetti. Ogni progetto ha i suoi task, le sue sezioni (headings) e il suo team.",
      placement: "right",
    },
    {
      target: '[data-tour="nav-all"]',
      title: "Tutti i Task",
      content:
        "Questa vista mostra tutti i task attivi, indipendentemente dal progetto. Utile per avere una panoramica completa.",
      placement: "right",
      beforeShow: () => navigateTo("all"),
    },
    {
      target: '[data-tour="nav-someday"]',
      title: "Prima o Poi",
      content:
        'I task che non vuoi affrontare ora ma non vuoi perdere. Cambia lo stato di un task a "someday" e ritrovalo qui.',
      placement: "right",
    },
  ],
};
