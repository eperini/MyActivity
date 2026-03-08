"use client";

import { Calendar, Inbox, Clock, CheckCircle2, Trash2, Plus, X, Zap, Grid2x2, Timer, MoreHorizontal, Pencil, CalendarDays, Users, BarChart3, Settings } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { TaskList } from "@/types";
import { createList, updateList, deleteList } from "@/lib/api";

interface SidebarProps {
  lists: TaskList[];
  selectedView: string;
  onSelectView: (view: string) => void;
  taskCounts: Record<string, number>;
  onListCreated: () => void;
  onShareList?: (list: TaskList) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const NAV_ITEMS = [
  { id: "today", label: "Oggi", icon: Calendar },
  { id: "next7", label: "Prossimi 7 Giorni", icon: Clock },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "habits", label: "Abitudini", icon: Zap },
  { id: "eisenhower", label: "Eisenhower", icon: Grid2x2 },
  { id: "pomodoro", label: "Pomodoro", icon: Timer },
  { id: "stats", label: "Statistiche", icon: BarChart3 },
  { id: "settings", label: "Impostazioni", icon: Settings },
];

const LIST_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6",
];

export default function Sidebar({ lists, selectedView, onSelectView, taskCounts, onListCreated, onShareList, isOpen, onClose }: SidebarProps) {
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);
  const [contextMenu, setContextMenu] = useState<{ listId: number; x: number; y: number } | null>(null);
  const [editingList, setEditingList] = useState<{ id: number; name: string; color: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    if (contextMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [contextMenu]);

  function handleNav(view: string) {
    onSelectView(view);
    onClose?.();
  }

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

  async function handleRenameList() {
    if (!editingList || !editingList.name.trim()) return;
    try {
      await updateList(editingList.id, { name: editingList.name.trim(), color: editingList.color });
      setEditingList(null);
      onListCreated();
    } catch {
      console.error("Failed to rename list");
    }
  }

  async function handleDeleteList(id: number) {
    try {
      await deleteList(id);
      setShowDeleteConfirm(null);
      if (selectedView === `list-${id}`) {
        onSelectView("inbox");
      }
      onListCreated();
    } catch {
      console.error("Failed to delete list");
    }
  }

  function handleContextMenu(e: React.MouseEvent, listId: number) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ listId, x: e.clientX, y: e.clientY });
  }

  const sidebarContent = (
    <aside className="w-full md:w-56 h-full bg-zinc-900 flex flex-col py-4 text-sm overflow-y-auto">
      {/* Navigation */}
      <nav className="px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = selectedView === item.id;
          const count = taskCounts[item.id] || 0;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg transition-colors ${
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <Icon size={20} className="md:w-[18px] md:h-[18px]" />
              <span className="flex-1 text-left text-base md:text-sm">{item.label}</span>
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
            const isEditing = editingList?.id === list.id;

            if (isEditing) {
              return (
                <div key={list.id} className="mx-1 p-2 bg-zinc-800 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: editingList.color }}
                    />
                    <input
                      autoFocus
                      value={editingList.name}
                      onChange={(e) => setEditingList({ ...editingList, name: e.target.value })}
                      className="flex-1 bg-transparent text-sm text-zinc-200 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameList();
                        if (e.key === "Escape") setEditingList(null);
                      }}
                    />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {LIST_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setEditingList({ ...editingList, color })}
                        className={`w-4 h-4 rounded-full transition-all ${
                          editingList.color === color ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-800 scale-110" : ""
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingList(null)}
                      className="flex-1 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={handleRenameList}
                      className="flex-1 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white"
                    >
                      Salva
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={list.id}
                className={`group flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
                onClick={() => handleNav(`list-${list.id}`)}
                onContextMenu={(e) => handleContextMenu(e, list.id)}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: list.color }}
                />
                <span className="flex-1 text-left truncate text-base md:text-sm">{list.name}</span>
                {count > 0 && (
                  <span className="text-xs text-zinc-500 group-hover:hidden">{count}</span>
                )}
                <button
                  onClick={(e) => handleContextMenu(e, list.id)}
                  className="text-zinc-600 hover:text-zinc-300 hidden group-hover:block"
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom */}
      <div className="mt-auto px-3 space-y-0.5">
        <button
          onClick={() => handleNav("completed")}
          className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors ${
            selectedView === "completed" ? "bg-zinc-800 text-white" : ""
          }`}
        >
          <CheckCircle2 size={20} className="md:w-[18px] md:h-[18px]" />
          <span className="text-base md:text-sm">Completati</span>
        </button>
        <button
          onClick={() => handleNav("trash")}
          className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors ${
            selectedView === "trash" ? "bg-zinc-800 text-white" : ""
          }`}
        >
          <Trash2 size={20} className="md:w-[18px] md:h-[18px]" />
          <span className="text-base md:text-sm">Cestino</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop: inline sidebar */}
      <div className="hidden md:flex md:flex-shrink-0 border-r border-zinc-800">
        {sidebarContent}
      </div>

      {/* Mobile: overlay sidebar */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />
          {/* Panel */}
          <div className="absolute inset-y-0 left-0 w-72 animate-slide-in">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const list = lists.find((l) => l.id === contextMenu.listId);
              if (list) setEditingList({ id: list.id, name: list.name, color: list.color });
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <Pencil size={14} />
            Modifica
          </button>
          <button
            onClick={() => {
              const list = lists.find((l) => l.id === contextMenu.listId);
              if (list && onShareList) onShareList(list);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <Users size={14} />
            Condividi
          </button>
          <button
            onClick={() => {
              setShowDeleteConfirm(contextMenu.listId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
          >
            <Trash2 size={14} />
            Elimina
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 max-w-sm mx-4">
            <h3 className="text-sm font-medium text-white mb-2">Elimina lista</h3>
            <p className="text-xs text-zinc-400 mb-4">
              Tutti i task nella lista verranno eliminati. Questa azione non si puo annullare.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-300"
              >
                Annulla
              </button>
              <button
                onClick={() => handleDeleteList(showDeleteConfirm)}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-white"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
