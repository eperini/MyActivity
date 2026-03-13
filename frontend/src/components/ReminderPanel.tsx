"use client";

import { useEffect, useState } from "react";
import { Bell, Plus, Trash2, X } from "lucide-react";
import { getReminders, createReminder, deleteReminder, type Reminder } from "@/lib/api";

const PRESETS = [
  { label: "15 min prima", offset: -15 },
  { label: "1 ora prima", offset: -60 },
  { label: "1 giorno prima", offset: -1440 },
];

function formatOffset(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs < 60) return `${abs} min prima`;
  if (abs < 1440) return `${Math.round(abs / 60)} ore prima`;
  return `${Math.round(abs / 1440)} giorni prima`;
}

export default function ReminderPanel({ taskId, hasDueDate }: { taskId: number; hasDueDate: boolean }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");
  const [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days">("hours");

  useEffect(() => {
    if (hasDueDate) {
      setLoading(true);
      getReminders(taskId).then(setReminders).catch(() => {}).finally(() => setLoading(false));
    }
  }, [taskId, hasDueDate]);

  async function handleAddPreset(offset: number) {
    try {
      const r = await createReminder(taskId, offset);
      setReminders((prev) => [...prev, r]);
    } catch {
      // duplicate or error, ignore
    }
  }

  async function handleAddCustom() {
    const val = parseInt(customMinutes);
    if (isNaN(val) || val <= 0) return;
    let offset = -val;
    if (customUnit === "hours") offset = -(val * 60);
    if (customUnit === "days") offset = -(val * 1440);
    try {
      const r = await createReminder(taskId, offset);
      setReminders((prev) => [...prev, r]);
      setShowCustom(false);
      setCustomMinutes("");
    } catch {}
  }

  async function handleDelete(id: number) {
    try {
      await deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch {}
  }

  if (!hasDueDate) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Bell size={16} />
          <span className="text-xs">Promemoria</span>
        </div>
        <p className="text-xs text-zinc-600">Imposta una scadenza per aggiungere promemoria</p>
      </div>
    );
  }

  const existingOffsets = new Set(reminders.map((r) => r.offset_minutes));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Bell size={16} />
        <span className="text-xs">Promemoria ({reminders.length})</span>
      </div>

      {/* Existing reminders */}
      {reminders.length > 0 && (
        <div className="space-y-1">
          {reminders.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-1.5">
              <span className="text-xs text-zinc-300">
                {formatOffset(r.offset_minutes)}
                {r.sent_at && <span className="text-zinc-600 ml-2">(inviato)</span>}
              </span>
              <button onClick={() => handleDelete(r.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.filter((p) => !existingOffsets.has(p.offset)).map((p) => (
          <button
            key={p.offset}
            onClick={() => handleAddPreset(p.offset)}
            className="px-2 py-1 bg-zinc-800 text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            {p.label}
          </button>
        ))}
        {!showCustom && (
          <button
            onClick={() => setShowCustom(true)}
            className="px-2 py-1 bg-zinc-800 text-[10px] text-blue-400 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-1"
          >
            <Plus size={10} /> Personalizzato
          </button>
        )}
      </div>

      {/* Custom input */}
      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            placeholder="Valore"
            className="w-16 bg-zinc-800 text-xs text-zinc-200 rounded-lg px-2 py-1.5 outline-none"
            min={1}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleAddCustom(); if (e.key === "Escape") setShowCustom(false); }}
          />
          <select
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value as typeof customUnit)}
            className="bg-zinc-800 text-xs text-zinc-300 rounded-lg px-2 py-1.5 outline-none"
          >
            <option value="minutes">minuti</option>
            <option value="hours">ore</option>
            <option value="days">giorni</option>
          </select>
          <span className="text-xs text-zinc-500">prima</span>
          <button onClick={handleAddCustom} className="text-blue-400 hover:text-blue-300 text-xs">OK</button>
          <button onClick={() => setShowCustom(false)} className="text-zinc-500 hover:text-zinc-300">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
