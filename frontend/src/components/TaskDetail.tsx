"use client";

import { useEffect, useState } from "react";
import { Calendar, Flag, List, Repeat, Trash2, X } from "lucide-react";
import type { Task, TaskList, RecurrenceRule } from "@/types";
import { formatRelativeDate, isOverdue } from "@/lib/dates";
import { getRecurrence, getRecurrencePreview, deleteRecurrence } from "@/lib/api";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import DatePicker from "./DatePicker";

interface TaskDetailProps {
  task: Task;
  list?: TaskList;
  onClose: () => void;
  onUpdate: (id: number, data: Partial<Task>) => void;
  onDelete: (id: number) => void;
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Urgente", color: "text-red-400" },
  2: { label: "Alta", color: "text-orange-400" },
  3: { label: "Media", color: "text-yellow-400" },
  4: { label: "Bassa", color: "text-zinc-400" },
};

function describeRrule(rrule: string, workdayAdjust: string, workdayTarget: number | null): string {
  const parts: Record<string, string> = {};
  rrule.split(";").forEach((p) => {
    const [k, v] = p.replace("RRULE:", "").split("=");
    parts[k] = v;
  });

  const freq = parts["FREQ"];
  const interval = parseInt(parts["INTERVAL"] || "1");
  const byDay = parts["BYDAY"];
  const byMonthDay = parts["BYMONTHDAY"];
  const bySetPos = parts["BYSETPOS"];

  const DAYS: Record<string, string> = {
    MO: "Lun", TU: "Mar", WE: "Mer", TH: "Gio", FR: "Ven", SA: "Sab", SU: "Dom",
  };

  let desc = "";

  if (freq === "DAILY") {
    desc = interval === 1 ? "Ogni giorno" : `Ogni ${interval} giorni`;
  } else if (freq === "WEEKLY") {
    const base = interval === 1 ? "Ogni settimana" : `Ogni ${interval} settimane`;
    if (byDay) {
      const days = byDay.split(",").map((d) => DAYS[d] || d).join(", ");
      desc = `${base} - ${days}`;
    } else {
      desc = base;
    }
  } else if (freq === "MONTHLY") {
    const base = interval === 1 ? "Ogni mese" : `Ogni ${interval} mesi`;
    if (bySetPos && byDay) {
      const pos = parseInt(bySetPos);
      const ordinals: Record<number, string> = { 1: "1°", 2: "2°", 3: "3°", 4: "4°", [-1]: "ultimo" };
      const day = DAYS[byDay] || byDay;
      desc = `${ordinals[pos] || pos} ${day} del mese`;
    } else if (byMonthDay) {
      desc = `${base} il giorno ${byMonthDay}`;
    } else {
      desc = base;
    }
  } else if (freq === "YEARLY") {
    desc = interval === 1 ? "Ogni anno" : `Ogni ${interval} anni`;
  }

  if (workdayAdjust === "next" && workdayTarget !== null) {
    const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
    desc += ` (primo ${WEEKDAYS[workdayTarget]} lavorativo)`;
  }

  return desc;
}

export default function TaskDetail({ task, list, onClose, onUpdate, onDelete }: TaskDetailProps) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[4];
  const overdue = task.due_date ? isOverdue(task.due_date) : false;

  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);
  const [previewDates, setPreviewDates] = useState<string[]>([]);
  const [loadingRec, setLoadingRec] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!task.has_recurrence) {
      setRecurrence(null);
      setPreviewDates([]);
      return;
    }
    setLoadingRec(true);
    Promise.all([
      getRecurrence(task.id).catch(() => null),
      getRecurrencePreview(task.id, 5).catch(() => ({ dates: [] })),
    ]).then(([rec, preview]) => {
      setRecurrence(rec);
      setPreviewDates(preview.dates);
    }).finally(() => setLoadingRec(false));
  }, [task.id, task.has_recurrence]);

  async function handleDeleteRecurrence() {
    await deleteRecurrence(task.id);
    setRecurrence(null);
    setPreviewDates([]);
  }

  return (
    <div className="w-80 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <X size={18} />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="text-zinc-400 hover:text-red-400 transition-colors"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title (editable) */}
        <input
          className="text-lg font-medium text-white bg-transparent outline-none w-full border-b border-transparent focus:border-zinc-700 transition-colors"
          defaultValue={task.title}
          key={`title-${task.id}`}
          onBlur={(e) => {
            const val = e.target.value.trim();
            if (val && val !== task.title) onUpdate(task.id, { title: val });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />

        {/* Description (editable) */}
        <textarea
          className="text-sm text-zinc-400 bg-transparent outline-none w-full resize-none border-b border-transparent focus:border-zinc-700 transition-colors placeholder-zinc-600"
          defaultValue={task.description || ""}
          key={`desc-${task.id}`}
          placeholder="Aggiungi descrizione..."
          rows={2}
          onBlur={(e) => {
            const val = e.target.value.trim();
            if (val !== (task.description || "")) onUpdate(task.id, { description: val || null } as any);
          }}
        />

        {/* Meta */}
        <div className="space-y-3">
          {/* List */}
          {list && (
            <div className="flex items-center gap-3 text-sm">
              <List size={16} className="text-zinc-500" />
              <span className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: list.color }}
                />
                <span className="text-zinc-300">{list.name}</span>
              </span>
            </div>
          )}

          {/* Due date (click to open picker) */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-3 text-sm w-full text-left"
            >
              <Calendar size={16} className="text-zinc-500" />
              {task.due_date ? (
                <span className={overdue ? "text-red-400" : "text-zinc-300"}>
                  {formatRelativeDate(task.due_date)}
                  {task.due_time && ` alle ${task.due_time}`}
                  {overdue && " (scaduto)"}
                </span>
              ) : (
                <span className="text-zinc-600">Aggiungi data...</span>
              )}
            </button>
            {showDatePicker && (
              <div className="absolute top-8 left-0 z-50">
                <DatePicker
                  value={task.due_date}
                  timeValue={task.due_time}
                  onChange={(d) => onUpdate(task.id, { due_date: d } as any)}
                  onTimeChange={(t) => onUpdate(task.id, { due_time: t } as any)}
                  onClose={() => setShowDatePicker(false)}
                />
              </div>
            )}
          </div>

          {/* Priority */}
          <div className="flex items-center gap-3 text-sm">
            <Flag size={16} className="text-zinc-500" />
            <div className="flex gap-1">
              {([1, 2, 3, 4] as const).map((p) => {
                const info = PRIORITY_LABELS[p];
                return (
                  <button
                    key={p}
                    onClick={() => onUpdate(task.id, { priority: p })}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      task.priority === p
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-500 hover:bg-zinc-800"
                    }`}
                  >
                    {info.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recurrence */}
          {recurrence && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <Repeat size={16} className="text-blue-400" />
                <span className="text-blue-400 flex-1">
                  {describeRrule(recurrence.rrule, recurrence.workday_adjust, recurrence.workday_target)}
                </span>
                <button
                  onClick={handleDeleteRecurrence}
                  className="text-zinc-600 hover:text-red-400 transition-colors"
                  title="Rimuovi ricorrenza"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Preview dates */}
              {previewDates.length > 0 && (
                <div className="ml-7 space-y-1">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Prossime date</span>
                  {previewDates.map((d) => (
                    <div key={d} className="text-xs text-zinc-500">
                      {format(parseISO(d), "EEEE d MMMM", { locale: it })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {loadingRec && (
            <div className="flex items-center gap-3 text-sm">
              <Repeat size={16} className="text-zinc-600" />
              <span className="text-zinc-600 text-xs">Caricamento...</span>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex gap-1">
              {(["todo", "doing", "done"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdate(task.id, { status: s })}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    task.status === s
                      ? s === "done"
                        ? "bg-green-600 text-white"
                        : s === "doing"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-700 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {s === "todo" ? "Da fare" : s === "doing" ? "In corso" : "Fatto"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
