"use client";

import { X } from "lucide-react";

interface Props {
  onClose: () => void;
}

const SECTIONS = [
  {
    title: "Generale",
    shortcuts: [
      { keys: ["N"], desc: "Nuovo task" },
      { keys: ["?"], desc: "Mostra scorciatoie" },
      { keys: ["Esc"], desc: "Chiudi pannello / modale" },
      { keys: ["B"], desc: "Toggle sidebar" },
      { keys: ["⌘", "K"], desc: "Cerca" },
    ],
  },
  {
    title: "Navigazione task",
    shortcuts: [
      { keys: ["J"], desc: "Task successivo" },
      { keys: ["K"], desc: "Task precedente" },
      { keys: ["Spazio"], desc: "Completa/riapri task selezionato" },
    ],
  },
  {
    title: "Viste rapide",
    shortcuts: [
      { keys: ["1"], desc: "Inbox" },
      { keys: ["2"], desc: "Oggi" },
      { keys: ["3"], desc: "Prossimi 7 Giorni" },
      { keys: ["4"], desc: "Abitudini" },
      { keys: ["5"], desc: "Kanban" },
      { keys: ["6"], desc: "Calendario" },
      { keys: ["7"], desc: "Statistiche" },
    ],
  },
];

export default function KeyboardShortcutsModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">
            Scorciatoie da tastiera
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.shortcuts.map((s) => (
                  <div
                    key={s.desc}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-zinc-300">{s.desc}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && (
                            <span className="text-zinc-600 mx-0.5">+</span>
                          )}
                          <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-300 font-mono">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-600 mt-5 text-center">
          Le scorciatoie sono disattivate quando si scrive in un campo di testo
        </p>
      </div>
    </div>
  );
}
