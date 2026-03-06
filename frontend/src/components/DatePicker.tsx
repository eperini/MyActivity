"use client";

import { useState, useRef, useEffect } from "react";
import {
  Sun, Sunrise, CalendarPlus, Moon,
  ChevronLeft, ChevronRight, Clock, X,
} from "lucide-react";
import {
  format, addDays, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay,
  isToday, parseISO,
} from "date-fns";
import { it } from "date-fns/locale";

interface DatePickerProps {
  value: string | null; // "YYYY-MM-DD" or null
  timeValue?: string | null; // "HH:MM" or null
  onChange: (date: string | null) => void;
  onTimeChange?: (time: string | null) => void;
  onClose: () => void;
}

function nextMonday(): Date {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const daysUntilMon = day === 0 ? 1 : 8 - day;
  return addDays(d, daysUntilMon);
}

function firstOfNextMonth(): Date {
  const d = new Date();
  return startOfMonth(addMonths(d, 1));
}

export default function DatePicker({ value, timeValue, onChange, onTimeChange, onClose }: DatePickerProps) {
  const [localValue, setLocalValue] = useState(value);
  const selected = localValue ? parseISO(localValue) : null;
  const [viewMonth, setViewMonth] = useState(selected || new Date());
  const [showTime, setShowTime] = useState(!!timeValue);
  const ref = useRef<HTMLDivElement>(null);

  // Sync if parent value changes externally
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Calendar grid
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  function selectDate(d: Date) {
    const str = format(d, "yyyy-MM-dd");
    setLocalValue(str);
    onChange(str);
  }

  function handleQuick(d: Date) {
    const str = format(d, "yyyy-MM-dd");
    setLocalValue(str);
    onChange(str);
    setViewMonth(d);
  }

  function handleClear() {
    setLocalValue(null);
    onChange(null);
    if (onTimeChange) onTimeChange(null);
    onClose();
  }

  return (
    <div
      ref={ref}
      className="w-64 bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl overflow-hidden z-50"
    >
      {/* Quick shortcuts */}
      <div className="flex items-center justify-around px-4 py-3 border-b border-zinc-800">
        <button
          type="button"
          onClick={() => handleQuick(new Date())}
          className="flex flex-col items-center gap-1 text-zinc-400 hover:text-blue-400 transition-colors"
          title="Oggi"
        >
          <Sun size={18} />
          <span className="text-[9px]">Oggi</span>
        </button>
        <button
          type="button"
          onClick={() => handleQuick(addDays(new Date(), 1))}
          className="flex flex-col items-center gap-1 text-zinc-400 hover:text-blue-400 transition-colors"
          title="Domani"
        >
          <Sunrise size={18} />
          <span className="text-[9px]">Domani</span>
        </button>
        <button
          type="button"
          onClick={() => handleQuick(nextMonday())}
          className="flex flex-col items-center gap-1 text-zinc-400 hover:text-blue-400 transition-colors"
          title="Prossimo lunedi"
        >
          <CalendarPlus size={18} />
          <span className="text-[9px]">Lun pross.</span>
        </button>
        <button
          type="button"
          onClick={() => handleQuick(firstOfNextMonth())}
          className="flex flex-col items-center gap-1 text-zinc-400 hover:text-blue-400 transition-colors"
          title="Mese prossimo"
        >
          <Moon size={18} />
          <span className="text-[9px]">Mese pross.</span>
        </button>
      </div>

      {/* Month header */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm font-medium text-white">
          {format(viewMonth, "MMMM yyyy", { locale: it })}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMonth((d) => subMonths(d, 1))}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setViewMonth(new Date())}
            className="w-2 h-2 rounded-full bg-zinc-600 hover:bg-blue-500 transition-colors"
            title="Oggi"
          />
          <button
            type="button"
            onClick={() => setViewMonth((d) => addMonths(d, 1))}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 px-3">
        {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => (
          <div key={i} className="text-center text-[10px] text-zinc-600 font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 px-3 pb-2">
        {days.map((day) => {
          const inMonth = isSameMonth(day, viewMonth);
          const isSelected = selected && isSameDay(day, selected);
          const today = isToday(day);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => selectDate(day)}
              className={`w-8 h-8 mx-auto rounded-full text-xs flex items-center justify-center transition-colors ${
                isSelected
                  ? "bg-blue-600 text-white"
                  : today
                  ? "text-blue-400 font-semibold"
                  : inMonth
                  ? "text-zinc-300 hover:bg-zinc-800"
                  : "text-zinc-700 hover:bg-zinc-800/50"
              }`}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      {/* Time section */}
      <div className="border-t border-zinc-800">
        <button
          type="button"
          onClick={() => setShowTime(!showTime)}
          className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Clock size={14} />
            <span>Orario</span>
          </span>
          {timeValue && <span className="text-xs text-zinc-500">{timeValue}</span>}
          <ChevronRight size={14} className={`transition-transform ${showTime ? "rotate-90" : ""}`} />
        </button>
        {showTime && onTimeChange && (
          <div className="flex items-center gap-2 px-4 pb-3">
            <input
              type="time"
              className="bg-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 outline-none [color-scheme:dark]"
              value={timeValue || ""}
              onChange={(e) => onTimeChange(e.target.value || null)}
            />
            {timeValue && (
              <button
                type="button"
                onClick={() => onTimeChange(null)}
                className="text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800">
        <button
          type="button"
          onClick={handleClear}
          className="flex-1 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors"
        >
          Rimuovi
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
}
