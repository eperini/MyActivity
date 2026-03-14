import type { Tour } from "../types";

export const collaborationTour: Tour = {
  id: "collaboration",
  name: "Collaborazione",
  description:
    "Lavora in team: membri, inviti, assegnazioni e commenti.",
  icon: "Users",
  estimatedMinutes: 1.5,
  steps: [
    {
      target: '[data-tour="project-members-tab"]',
      title: "Team di progetto",
      content:
        "Ogni progetto puo' avere piu' membri con ruoli diversi: Admin, Super User, User, Viewer.",
      placement: "bottom",
    },
    {
      target: '[data-tour="project-invite"]',
      title: "Invita membri",
      content:
        "Invita via email. Il destinatario riceve una notifica e puo' accettare o rifiutare.",
      placement: "bottom",
    },
    {
      target: '[data-tour="task-assign"]',
      title: "Assegna task",
      content:
        "Nel dettaglio task, scegli a chi assegnarlo tra i membri del progetto.",
      placement: "left",
    },
    {
      target: '[data-tour="task-comments"]',
      title: "Commenti",
      content:
        "Ogni task ha una sezione commenti per discutere con il team.",
      placement: "left",
    },
  ],
};
