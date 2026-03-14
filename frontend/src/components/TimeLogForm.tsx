"use client";

import { DateInput } from "./DatePicker";

const DURATION_SHORTCUTS = [
  { label: "1h", hours: 1, mins: 0 },
  { label: "1,5h", hours: 1, mins: 30 },
  { label: "2h", hours: 2, mins: 0 },
  { label: "3h", hours: 3, mins: 0 },
  { label: "4h", hours: 4, mins: 0 },
  { label: "5h", hours: 5, mins: 0 },
  { label: "6h", hours: 6, mins: 0 },
  { label: "7h", hours: 7, mins: 0 },
  { label: "8h", hours: 8, mins: 0 },
];

interface TimeLogFormProps {
  logDate: string;
  onDateChange: (d: string) => void;
  hours: number;
  onHoursChange: (h: number) => void;
  mins: number;
  onMinsChange: (m: number) => void;
  note: string;
  onNoteChange: (n: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

export default function TimeLogForm({
  logDate,
  onDateChange,
  hours,
  onHoursChange,
  mins,
  onMinsChange,
  note,
  onNoteChange,
  onSave,
  onCancel,
  saving,
}: TimeLogFormProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <DateInput value={logDate} onChange={onDateChange} />
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={23}
            value={hours}
            onChange={(e) => onHoursChange(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-14 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-zinc-300 outline-none text-center focus:border-zinc-500"
            placeholder="0"
          />
          <span className="text-sm text-zinc-500">h</span>
          <input
            type="number"
            min={0}
            max={59}
            value={mins}
            onChange={(e) => onMinsChange(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
            className="w-14 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-zinc-300 outline-none text-center focus:border-zinc-500"
            placeholder="0"
          />
          <span className="text-sm text-zinc-500">m</span>
        </div>
      </div>

      {/* Duration shortcuts */}
      <div className="flex gap-1.5 flex-wrap">
        {DURATION_SHORTCUTS.map((s) => (
          <button
            key={s.label}
            onClick={() => {
              onHoursChange(s.hours);
              onMinsChange(s.mins);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              hours === s.hours && mins === s.mins
                ? "bg-blue-600 text-white"
                : "bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Nota (opzionale)..."
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none placeholder-zinc-600 focus:border-zinc-500"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
        />
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-300 transition-colors"
        >
          Annulla
        </button>
        <button
          onClick={onSave}
          disabled={saving || (hours * 60 + mins <= 0)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm text-white font-medium transition-colors"
        >
          {saving ? "..." : "Salva"}
        </button>
      </div>
    </div>
  );
}
