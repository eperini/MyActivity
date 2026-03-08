"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar, Flag, List, Repeat, X } from "lucide-react";
import type { TaskList } from "@/types";
import { createTask, setRecurrence } from "@/lib/api";
import DatePicker from "./DatePicker";
import { formatRelativeDate } from "@/lib/dates";

interface AddTaskFormProps {
  lists: TaskList[];
  defaultListId?: number;
  onCreated: () => void;
  onClose: () => void;
}

const PRIORITIES = [
  { value: 1, label: "Urgente", color: "bg-red-500" },
  { value: 2, label: "Alta", color: "bg-orange-500" },
  { value: 3, label: "Media", color: "bg-yellow-500" },
  { value: 4, label: "Bassa", color: "bg-zinc-500" },
];

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

type RecurrenceType = "none" | "daily" | "weekly" | "monthly" | "monthly_workday" | "yearly";

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: "none", label: "Nessuna" },
  { value: "daily", label: "Ogni giorno" },
  { value: "weekly", label: "Ogni settimana" },
  { value: "monthly", label: "Ogni mese" },
  { value: "monthly_workday", label: "Giorno lavorativo" },
  { value: "yearly", label: "Ogni anno" },
];

export default function AddTaskForm({ lists, defaultListId, onCreated, onClose }: AddTaskFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listId, setListId] = useState(defaultListId || lists[0]?.id || 0);
  const [priority, setPriority] = useState(4);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);

  // Recurrence state
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [monthDay, setMonthDay] = useState(1);
  const [workdayTarget, setWorkdayTarget] = useState(0); // 0=Monday

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function getRecurrenceDescription(): string {
    if (recurrenceType === "none") return "";
    const interval = recurrenceInterval > 1 ? `ogni ${recurrenceInterval} ` : "ogni ";
    switch (recurrenceType) {
      case "daily":
        return recurrenceInterval === 1 ? "Ogni giorno" : `Ogni ${recurrenceInterval} giorni`;
      case "weekly":
        if (selectedDays.length === 0) {
          return recurrenceInterval === 1 ? "Ogni settimana" : `Ogni ${recurrenceInterval} settimane`;
        }
        return `${interval}sett. - ${selectedDays.map((d) => WEEKDAYS[d]).join(", ")}`;
      case "monthly":
        return `${interval}mese il giorno ${monthDay}`;
      case "monthly_workday":
        return `Primo ${WEEKDAYS[workdayTarget]} dopo il ${monthDay} del mese`;
      case "yearly":
        return recurrenceInterval === 1 ? "Ogni anno" : `Ogni ${recurrenceInterval} anni`;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !listId) return;

    setSubmitting(true);
    try {
      const task = await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        list_id: listId,
        priority,
        due_date: dueDate || undefined,
        due_time: dueTime || undefined,
      } as Parameters<typeof createTask>[0]);

      // Set recurrence if selected
      if (recurrenceType !== "none") {
        const recData: Parameters<typeof setRecurrence>[1] = {
          frequency: recurrenceType === "monthly_workday" ? "monthly" : recurrenceType,
          interval: recurrenceInterval,
        };

        if (recurrenceType === "weekly" && selectedDays.length > 0) {
          recData.days_of_week = selectedDays;
        }
        if (recurrenceType === "monthly" || recurrenceType === "monthly_workday") {
          recData.day_of_month = monthDay;
        }
        if (recurrenceType === "monthly_workday") {
          recData.workday_adjust = "next";
          recData.workday_target = workdayTarget;
        }

        await setRecurrence(task.id, recData);
      }

      onCreated();
      onClose();
    } catch {
      console.error("Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[5vh] sm:pt-[10vh] px-4 overflow-y-auto pb-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl overflow-visible"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <span className="text-sm font-medium text-zinc-300">Nuovo task</span>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Title */}
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Cosa devi fare?"
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

          {/* Quick actions row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* List */}
            <div className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-3 py-1.5">
              <List size={14} className="text-zinc-500" />
              <select
                value={listId}
                onChange={(e) => setListId(Number(e.target.value))}
                className="bg-transparent text-xs text-zinc-300 outline-none cursor-pointer"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id} className="bg-zinc-800">
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Due date */}
            <div>
              <button
                ref={dateButtonRef}
                type="button"
                onClick={() => {
                  if (!showDatePicker && dateButtonRef.current) {
                    const rect = dateButtonRef.current.getBoundingClientRect();
                    setPickerPos({ top: rect.bottom + 4, left: rect.left });
                  }
                  setShowDatePicker(!showDatePicker);
                }}
                className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-3 py-1.5"
              >
                <Calendar size={14} className="text-zinc-500" />
                <span className="text-xs text-zinc-300">
                  {dueDate ? formatRelativeDate(dueDate) : "Data"}
                  {dueTime && ` ${dueTime}`}
                </span>
              </button>
            </div>

            {/* More toggle */}
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showMore ? "Meno" : "Altro..."}
            </button>
          </div>

          {/* Recurrence section */}
          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <label className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1.5">
              <Repeat size={12} />
              Ricorrenza
            </label>

            {/* Recurrence type selector */}
            <div className="flex gap-1.5 flex-wrap">
              {RECURRENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRecurrenceType(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    recurrenceType === opt.value
                      ? "bg-blue-600/20 text-blue-400 ring-1 ring-blue-600/50"
                      : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Recurrence details */}
            {recurrenceType !== "none" && (
              <div className="space-y-3 pl-1">
                {/* Interval */}
                {recurrenceType !== "monthly_workday" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Ogni</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={recurrenceInterval}
                      onChange={(e) => setRecurrenceInterval(Number(e.target.value) || 1)}
                      className="w-14 bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 outline-none text-center"
                    />
                    <span className="text-xs text-zinc-500">
                      {recurrenceType === "daily" && (recurrenceInterval === 1 ? "giorno" : "giorni")}
                      {recurrenceType === "weekly" && (recurrenceInterval === 1 ? "settimana" : "settimane")}
                      {recurrenceType === "monthly" && (recurrenceInterval === 1 ? "mese" : "mesi")}
                      {recurrenceType === "yearly" && (recurrenceInterval === 1 ? "anno" : "anni")}
                    </span>
                  </div>
                )}

                {/* Weekly: day picker */}
                {recurrenceType === "weekly" && (
                  <div className="flex gap-1">
                    {WEEKDAYS.map((day, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        className={`w-9 h-9 rounded-full text-xs font-medium transition-colors ${
                          selectedDays.includes(idx)
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                )}

                {/* Monthly: day of month */}
                {(recurrenceType === "monthly" || recurrenceType === "monthly_workday") && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Giorno del mese:</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={monthDay}
                      onChange={(e) => setMonthDay(Number(e.target.value) || 1)}
                      className="w-14 bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 outline-none text-center"
                    />
                  </div>
                )}

                {/* Monthly workday: target weekday */}
                {recurrenceType === "monthly_workday" && (
                  <div className="space-y-2">
                    <span className="text-xs text-zinc-500">Primo giorno lavorativo dopo:</span>
                    <div className="flex gap-1">
                      {WEEKDAYS.slice(0, 5).map((day, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setWorkdayTarget(idx)}
                          className={`w-9 h-9 rounded-full text-xs font-medium transition-colors ${
                            workdayTarget === idx
                              ? "bg-blue-600 text-white"
                              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="text-xs text-blue-400/70 italic">
                  {getRecurrenceDescription()}
                </div>
              </div>
            )}
          </div>

          {/* Extended options */}
          {showMore && (
            <div className="space-y-3 pt-2 border-t border-zinc-800">
              {/* Priority */}
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Priorita</label>
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        priority === p.value
                          ? "bg-zinc-700 text-white"
                          : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${p.color}`} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
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
            disabled={!title.trim() || submitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-xs font-medium text-white transition-colors"
          >
            {submitting ? "..." : "Crea task"}
          </button>
        </div>
      </form>

      {/* DatePicker as fixed overlay to avoid clipping */}
      {showDatePicker && pickerPos && (
        <div
          className="fixed z-[60]"
          style={{ top: pickerPos.top, left: pickerPos.left }}
        >
          <DatePicker
            value={dueDate || null}
            timeValue={dueTime || null}
            onChange={(d) => setDueDate(d || "")}
            onTimeChange={(t) => setDueTime(t || "")}
            onClose={() => setShowDatePicker(false)}
          />
        </div>
      )}
    </div>
  );
}
