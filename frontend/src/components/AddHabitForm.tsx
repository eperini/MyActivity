"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { format } from "date-fns";
import { createHabit } from "@/lib/api";

interface AddHabitFormProps {
  onCreated: () => void;
  onClose: () => void;
}

const COLORS = [
  "#10B981", "#3B82F6", "#EF4444", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6",
];

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export default function AddHabitForm({ onCreated, onClose }: AddHabitFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [frequencyType, setFrequencyType] = useState("daily");
  const [frequencyDays, setFrequencyDays] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function toggleDay(day: number) {
    setFrequencyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      await createHabit({
        name: name.trim(),
        description: description.trim() || undefined,
        frequency_type: frequencyType,
        frequency_days: frequencyType === "custom" ? frequencyDays : [],
        start_date: format(new Date(), "yyyy-MM-dd"),
        color,
      } as any);
      onCreated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[15vh]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <span className="text-sm font-medium text-zinc-300">Nuova abitudine</span>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome abitudine..."
            className="w-full bg-transparent text-base text-white outline-none placeholder-zinc-600"
          />

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrizione (opzionale)"
            rows={2}
            className="w-full bg-transparent text-sm text-zinc-300 outline-none placeholder-zinc-600 resize-none"
          />

          {/* Color */}
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Colore</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-900 scale-110" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Frequenza</label>
            <div className="flex gap-2">
              {[
                { value: "daily", label: "Ogni giorno" },
                { value: "weekly", label: "Settimanale" },
                { value: "custom", label: "Personalizzata" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFrequencyType(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    frequencyType === opt.value
                      ? "bg-blue-600/20 text-blue-400 ring-1 ring-blue-600/50"
                      : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom days */}
          {frequencyType === "custom" && (
            <div className="flex gap-1">
              {WEEKDAYS.map((day, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`w-9 h-9 rounded-full text-xs font-medium transition-colors ${
                    frequencyDays.includes(idx)
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-xs font-medium text-white transition-colors"
          >
            {submitting ? "..." : "Crea"}
          </button>
        </div>
      </form>
    </div>
  );
}
