"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { createPomodoroSession } from "@/lib/api";
import { useToast } from "./Toast";

interface PomodoroTimerProps {
  onSessionComplete: () => void;
}

type TimerMode = "pomodoro" | "short_break" | "long_break";

const MODES: { key: TimerMode; label: string; minutes: number; color: string }[] = [
  { key: "pomodoro", label: "Pomo", minutes: 25, color: "#3B82F6" },
  { key: "short_break", label: "Pausa", minutes: 5, color: "#10B981" },
  { key: "long_break", label: "Pausa lunga", minutes: 15, color: "#8B5CF6" },
];

export default function PomodoroTimer({ onSessionComplete }: PomodoroTimerProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<TimerMode>("pomodoro");
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [pomosCompleted, setPomosCompleted] = useState(0);
  const startTimeRef = useRef<Date | null>(null);
  const pomosRef = useRef(0);

  const currentMode = MODES.find((m) => m.key === mode)!;
  const totalSeconds = currentMode.minutes * 60;
  const progress = 1 - secondsLeft / totalSeconds;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  // Keep ref in sync
  pomosRef.current = pomosCompleted;

  const switchMode = useCallback((newMode: TimerMode) => {
    setMode(newMode);
    setIsRunning(false);
    startTimeRef.current = null;
    const m = MODES.find((x) => x.key === newMode)!;
    setSecondsLeft(m.minutes * 60);
  }, []);

  const handleComplete = useCallback(async () => {
    setIsRunning(false);

    if (mode === "pomodoro" && startTimeRef.current) {
      const ended = new Date();
      try {
        await createPomodoroSession({
          started_at: startTimeRef.current.toISOString(),
          ended_at: ended.toISOString(),
          duration_minutes: currentMode.minutes,
          session_type: "pomodoro",
        });
      } catch {
        showToast("Errore nel salvataggio della sessione");
      }

      const newCount = pomosRef.current + 1;
      setPomosCompleted(newCount);
      onSessionComplete();

      // Auto switch to break
      if (newCount % 4 === 0) {
        switchMode("long_break");
      } else {
        switchMode("short_break");
      }
    } else {
      // Break finished, switch to pomodoro
      switchMode("pomodoro");
    }
  }, [mode, currentMode.minutes, onSessionComplete, switchMode]);

  // Single interval, only depends on isRunning
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  // Handle timer reaching 0
  useEffect(() => {
    if (secondsLeft === 0 && isRunning) {
      handleComplete();
    }
  }, [secondsLeft, isRunning, handleComplete]);

  function handleStart() {
    if (!startTimeRef.current) {
      startTimeRef.current = new Date();
    }
    setIsRunning(true);
  }

  function handlePause() {
    setIsRunning(false);
  }

  function handleReset() {
    setIsRunning(false);
    startTimeRef.current = null;
    setSecondsLeft(currentMode.minutes * 60);
  }

  function handleSkip() {
    handleComplete();
  }

  // SVG circle params
  const radius = 140;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-lg font-semibold text-white">Pomodoro</h1>
        <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => switchMode(m.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                mode === m.key
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timer */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        {/* Pomos counter */}
        <div className="flex items-center gap-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${
                i < (pomosCompleted % 4) ? "bg-blue-500" : "bg-zinc-800"
              }`}
            />
          ))}
        </div>

        {/* Circle timer */}
        <div className="relative">
          <svg width="320" height="320" className="-rotate-90">
            {/* Background circle */}
            <circle
              cx="160"
              cy="160"
              r={radius}
              fill="none"
              stroke="#27272A"
              strokeWidth="4"
            />
            {/* Progress circle */}
            <circle
              cx="160"
              cy="160"
              r={radius}
              fill="none"
              stroke={currentMode.color}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>

          {/* Time display */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl font-light text-white tabular-nums">
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleReset}
            className="p-3 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Reset"
          >
            <RotateCcw size={20} />
          </button>

          {isRunning ? (
            <button
              onClick={handlePause}
              className="px-10 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-full text-white font-medium transition-colors"
            >
              <Pause size={20} className="inline mr-2" />
              Pausa
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="px-10 py-3 rounded-full text-white font-medium transition-colors"
              style={{ backgroundColor: currentMode.color }}
            >
              <Play size={20} className="inline mr-2" />
              {startTimeRef.current ? "Riprendi" : "Avvia"}
            </button>
          )}

          <button
            onClick={handleSkip}
            className="p-3 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Salta"
          >
            <SkipForward size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
