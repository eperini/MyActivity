"use client";

import { CheckSquare, CalendarDays, Grid2x2, Zap, MoreHorizontal } from "lucide-react";

interface BottomTabBarProps {
  selectedView: string;
  onSelectView: (view: string) => void;
}

const TABS = [
  { id: "inbox", icon: CheckSquare, label: "Task" },
  { id: "calendar", icon: CalendarDays, label: "Calendario" },
  { id: "eisenhower", icon: Grid2x2, label: "Matrice" },
  { id: "habits", icon: Zap, label: "Abitudini" },
  { id: "_more", icon: MoreHorizontal, label: "Altro" },
];

// Views that map to each tab for highlighting
const TAB_VIEWS: Record<string, string[]> = {
  inbox: ["inbox", "today", "next7", "completed"],
  calendar: ["calendar"],
  eisenhower: ["eisenhower"],
  habits: ["habits", "pomodoro"],
  _more: ["stats", "settings", "kanban"],
};

function getActiveTab(selectedView: string): string {
  for (const [tab, views] of Object.entries(TAB_VIEWS)) {
    if (views.includes(selectedView)) return tab;
  }
  // list-* views map to inbox tab
  if (selectedView.startsWith("list-")) return "inbox";
  return "inbox";
}

export default function BottomTabBar({ selectedView, onSelectView }: BottomTabBarProps) {
  const activeTab = getActiveTab(selectedView);

  function handleTap(tabId: string) {
    if (tabId === "_more") {
      // Cycle between stats, settings, kanban
      const moreViews = ["stats", "settings", "kanban"];
      const idx = moreViews.indexOf(selectedView);
      onSelectView(moreViews[(idx + 1) % moreViews.length]);
      return;
    }
    if (tabId === "habits") {
      // Cycle between habits and pomodoro
      onSelectView(selectedView === "habits" ? "pomodoro" : "habits");
      return;
    }
    onSelectView(tabId);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-900 border-t border-zinc-800 md:hidden">
      <div className="flex items-center justify-around h-14 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTap(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${
                isActive ? "text-blue-400" : "text-zinc-500"
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px]">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
