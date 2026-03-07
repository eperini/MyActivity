"use client";

import { Calendar, Inbox, Clock, CheckCircle2, Trash2, Plus, X, Zap, Grid2x2, Timer } from "lucide-react";
import { useState } from "react";
import type { TaskList } from "@/types";
import { createList } from "@/lib/api";

interface SidebarProps {
  lists: TaskList[];
  selectedView: string;
  onSelectView: (view: string) => void;
  taskCounts: Record<string, number>;
  onListCreated: () => void;
}

const NAV_ITEMS = [
  { id: "today", label: "Oggi", icon: Calendar },
  { id: "next7", label: "Prossimi 7 Giorni", icon: Clock },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "habits", label: "Abitudini", icon: Zap },
  { id: "eisenhower", label: "Eisenhower", icon: Grid2x2 },
  { id: "pomodoro", label: "Pomodoro", icon: Timer },
];

const LIST_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6",
];

export default function Sidebar({ lists, selectedView, onSelectView, taskCounts, onListCreated }: SidebarProps) {
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);

  async function handleCreateList() {
    if (!newListName.trim()) return;
    try {
      await createList({ name: newListName.trim(), color: newListColor });
      setNewListName("");
      setNewListColor(LIST_COLORS[0]);
      setShowNewList(false);
      onListCreated();
    } catch {
      console.error("Failed to create list");
    }
  }

  return (
    <aside className="w-56 h-full bg-zinc-900 border-r border-zinc-800 flex flex-col py-4 text-sm">
      {/* Navigation */}
      <nav className="px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = selectedView === item.id;
          const count = taskCounts[item.id] || 0;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <Icon size={18} />
              <span className="flex-1 text-left">{item.label}</span>
              {count > 0 && (
                <span className="text-xs text-zinc-500">{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Lists */}
      <div className="mt-6 px-3">
        <div className="flex items-center justify-between px-3 mb-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Liste</span>
          <button
            onClick={() => setShowNewList(true)}
            className="text-zinc-500 hover:text-blue-400 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* New list form */}
        {showNewList && (
          <div className="mb-2 mx-1 p-3 bg-zinc-800 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Nome lista..."
                className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder-zinc-600"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateList();
                  if (e.key === "Escape") setShowNewList(false);
                }}
              />
              <button onClick={() => setShowNewList(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {LIST_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewListColor(color)}
                  className={`w-5 h-5 rounded-full transition-all ${
                    newListColor === color ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-800 scale-110" : ""
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <button
              onClick={handleCreateList}
              disabled={!newListName.trim()}
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-xs font-medium text-white transition-colors"
            >
              Crea lista
            </button>
          </div>
        )}

        <div className="space-y-0.5">
          {lists.map((list) => {
            const isActive = selectedView === `list-${list.id}`;
            const count = taskCounts[`list-${list.id}`] || 0;
            return (
              <button
                key={list.id}
                onClick={() => onSelectView(`list-${list.id}`)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: list.color }}
                />
                <span className="flex-1 text-left truncate">{list.name}</span>
                {count > 0 && (
                  <span className="text-xs text-zinc-500">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom */}
      <div className="mt-auto px-3 space-y-0.5">
        <button
          onClick={() => onSelectView("completed")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors ${
            selectedView === "completed" ? "bg-zinc-800 text-white" : ""
          }`}
        >
          <CheckCircle2 size={18} />
          <span>Completati</span>
        </button>
        <button
          onClick={() => onSelectView("trash")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors ${
            selectedView === "trash" ? "bg-zinc-800 text-white" : ""
          }`}
        >
          <Trash2 size={18} />
          <span>Cestino</span>
        </button>
      </div>
    </aside>
  );
}
