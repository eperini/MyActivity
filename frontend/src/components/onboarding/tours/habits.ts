import type { Tour } from "../types";
import { navigateTo } from "./helpers";

export const habitsTour: Tour = {
  id: "habits",
  name: "Abitudini",
  description: "Traccia le tue abitudini quotidiane e settimanali.",
  icon: "Star",
  estimatedMinutes: 1.5,
  steps: [
    {
      target: '[data-tour="nav-habits"]',
      title: "Abitudini",
      content:
        "Traccia le abitudini quotidiane o settimanali. Ogni abitudine ha frequenza, colore e statistiche.",
      placement: "right",
      beforeShow: () => navigateTo("habits"),
    },
    {
      target: '[data-tour="habit-list"]',
      title: "La lista",
      content:
        "Vedi tutte le abitudini attive con lo stato di oggi. Clicca il cerchio per segnare come fatto.",
      placement: "right",
    },
    {
      target: '[data-tour="habit-add-btn"]',
      title: "Nuova abitudine",
      content:
        "Crea un'abitudine con nome, frequenza (giornaliera, settimanale) e colore.",
      placement: "bottom",
    },
    {
      target: '[data-tour="nav-stats"]',
      title: "Streak e statistiche",
      content:
        "Nelle statistiche trovi per ogni abitudine: tasso di completamento, streak attuale e riepilogo mensile.",
      placement: "right",
    },
  ],
};
