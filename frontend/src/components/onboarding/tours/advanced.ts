import type { Tour } from "../types";
import { navigateTo } from "./helpers";

export const advancedTour: Tour = {
  id: "advanced",
  name: "Funzionalita' Avanzate",
  description:
    "Ricorrenze, dipendenze, automazioni, sprint e integrazioni.",
  icon: "Settings",
  estimatedMinutes: 2,
  steps: [
    {
      target: '[data-tour="task-recurrence"]',
      title: "Ricorrenze",
      content:
        "Imposta task ricorrenti: giornalieri, settimanali, mensili. Supporto completo RRULE.",
      placement: "left",
    },
    {
      target: '[data-tour="task-dependencies"]',
      title: "Dipendenze",
      content:
        "Dichiara che un task blocca o e' bloccato da un altro. Utile per flussi complessi.",
      placement: "left",
    },
    {
      target: '[data-tour="project-automations"]',
      title: "Automazioni",
      content:
        "Regole if-then: quando un task cambia stato, assegnalo, creane un altro, invia notifica...",
      placement: "bottom",
    },
    {
      target: '[data-tour="project-sprints"]',
      title: "Sprint",
      content:
        "Iterazioni a tempo per organizzare il lavoro in cicli. Imposta date e obiettivi.",
      placement: "bottom",
    },
    {
      target: '[data-tour="settings-integrations"]',
      title: "Integrazioni",
      content:
        "Collega Jira, Google Calendar e Tempo per sincronizzare task e ore lavorate.",
      placement: "right",
      beforeShow: () => navigateTo("settings"),
    },
  ],
};
