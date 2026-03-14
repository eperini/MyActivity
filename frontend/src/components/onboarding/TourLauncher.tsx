"use client";

import { Play, Check, FolderOpen, Zap, Star, Users, Settings } from "lucide-react";
import { tours } from "./tours";
import { useOnboarding } from "./OnboardingProvider";

const ICONS: Record<string, React.ElementType> = {
  Play,
  FolderOpen,
  Zap,
  Star,
  Users,
  Settings,
};

export default function TourLauncher() {
  const { startTour, completedTours } = useOnboarding();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-300">Guida interattiva</h3>
      <p className="text-xs text-zinc-500">
        Percorsi tematici per scoprire tutte le funzionalita&apos; di Zeno.
      </p>
      <div className="space-y-1.5">
        {tours.map((tour) => {
          const Icon = ICONS[tour.icon] || Play;
          const isCompleted = completedTours.includes(tour.id);
          return (
            <button
              key={tour.id}
              onClick={() => startTour(tour.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 transition-colors text-left group"
            >
              <Icon size={16} className={isCompleted ? "text-green-400" : "text-zinc-400 group-hover:text-blue-400"} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200">{tour.name}</div>
                <div className="text-[10px] text-zinc-500 truncate">{tour.description}</div>
              </div>
              <span className="text-[10px] text-zinc-600 whitespace-nowrap">~{tour.estimatedMinutes} min</span>
              {isCompleted && (
                <Check size={14} className="text-green-400 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
