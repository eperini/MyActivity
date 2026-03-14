import type { Tour } from "../types";
import { navigateTo } from "./helpers";

export const welcomeTour: Tour = {
  id: "welcome",
  name: "Benvenuto",
  description: "Scopri le basi di Zeno: navigazione, task e impostazioni.",
  icon: "Play",
  estimatedMinutes: 2,
  steps: [
    {
      target: '[data-tour="sidebar"]',
      title: "Benvenuto in Zeno!",
      content:
        "Questa e' la tua barra laterale. Da qui navighi tra le viste, i progetti e le impostazioni.",
      placement: "right",
    },
    {
      target: '[data-tour="nav-today"]',
      title: "Oggi",
      content:
        "La tua vista principale. Mostra i task in scadenza oggi e quelli con data di inizio oggi o precedente.",
      placement: "right",
      beforeShow: () => navigateTo("today"),
    },
    {
      target: '[data-tour="nav-inbox"]',
      title: "Inbox",
      content:
        "L'area di cattura. Ogni task senza progetto e senza date finisce qui. Elaborali quando sei pronto: assegna un progetto, una data, o archiviali in \"Prima o Poi\".",
      placement: "right",
    },
    {
      target: '[data-tour="sidebar-projects"]',
      title: "Aree e Progetti",
      content:
        "Organizza il lavoro in Aree (macro-categorie) e Progetti. Clicca su un progetto per vedere i suoi task.",
      placement: "right",
    },
    {
      target: '[data-tour="add-task-btn"]',
      title: "Crea un Task",
      content:
        'Premi qui (o il tasto N) per creare un nuovo task. Puoi assegnare progetto, priorita\', scadenza e tag.',
      placement: "bottom",
    },
    {
      target: '[data-tour="nav-settings"]',
      title: "Impostazioni",
      content:
        "Da qui configuri tema, notifiche, integrazioni e puoi sempre rivedere questa guida. Buon lavoro!",
      placement: "right",
    },
  ],
};
