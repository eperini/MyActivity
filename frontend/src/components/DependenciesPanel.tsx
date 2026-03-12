"use client";

import { useEffect, useState, useRef } from "react";
import { ChevronDown, ChevronRight, X, Plus, Link } from "lucide-react";
import type { Task, TaskDependencies, TaskDependencyItem } from "@/types";
import { getTaskDependencies, addTaskDependency, removeTaskDependency, getTasks } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface DependenciesPanelProps {
  taskId: number;
  allTasks?: Task[];
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  todo: { label: "Da fare", cls: "bg-zinc-700 text-zinc-300" },
  doing: { label: "In corso", cls: "bg-yellow-900/50 text-yellow-400" },
  done: { label: "Fatto", cls: "bg-green-900/50 text-green-400" },
};

const DEP_TYPE_OPTIONS = [
  { value: "blocks", label: "Blocca" },
  { value: "blocked_by", label: "Bloccato da" },
  { value: "relates_to", label: "Correlato" },
  { value: "duplicates", label: "Duplicato" },
];

export default function DependenciesPanel({ taskId, allTasks: externalTasks }: DependenciesPanelProps) {
  const { showToast } = useToast();
  const [collapsed, setCollapsed] = useState(true);
  const [deps, setDeps] = useState<TaskDependencies | null>(null);
  const [loading, setLoading] = useState(false);

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [depType, setDepType] = useState("blocks");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Tasks for selection
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const tasks = externalTasks || localTasks;

  useEffect(() => {
    if (!collapsed) {
      loadDeps();
      if (!externalTasks) {
        getTasks().then(setLocalTasks).catch(() => {});
      }
    }
  }, [collapsed, taskId]);

  async function loadDeps() {
    setLoading(true);
    try {
      const data = await getTaskDependencies(taskId);
      setDeps(data);
    } catch (e) {
      if (e instanceof Error && e.message !== "Non autorizzato") {
        showToast("Errore caricamento dipendenze");
      }
    } finally {
      setLoading(false);
    }
  }

  // All linked task IDs to exclude from selection
  const linkedIds = new Set<number>();
  if (deps) {
    deps.blocking.forEach(d => linkedIds.add(d.task_id));
    deps.blocked_by.forEach(d => linkedIds.add(d.task_id));
    deps.relates_to.forEach(d => linkedIds.add(d.task_id));
  }
  linkedIds.add(taskId);

  const filteredTasks = tasks.filter(t =>
    !linkedIds.has(t.id) &&
    t.parent_id === null &&
    t.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleAdd(relatedTaskId: number) {
    setSubmitting(true);
    try {
      await addTaskDependency(taskId, relatedTaskId, depType);
      setSearchQuery("");
      setShowDropdown(false);
      setShowForm(false);
      await loadDeps();
    } catch (e) {
      if (e instanceof Error) {
        if (e.message.includes("circolare") || e.message.includes("circular")) {
          showToast("Dipendenza circolare non consentita");
        } else {
          showToast(e.message || "Errore aggiunta dipendenza");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(depId: number) {
    try {
      await removeTaskDependency(taskId, depId);
      await loadDeps();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Errore rimozione dipendenza");
    }
  }

  const totalCount = deps ? deps.blocking.length + deps.blocked_by.length + deps.relates_to.length : 0;

  function renderSection(label: string, items: TaskDependencyItem[]) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</span>
        {items.map(dep => {
          const badge = STATUS_BADGE[dep.status] || STATUS_BADGE.todo;
          return (
            <div key={dep.id} className="flex items-center gap-2 group/dep">
              <span className="flex-1 text-xs text-zinc-300 truncate">{dep.title}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${badge.cls}`}>
                {badge.label}
              </span>
              <button
                onClick={() => handleRemove(dep.id)}
                className="opacity-0 group-hover/dep:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-3 text-sm w-full text-left"
      >
        {collapsed ? (
          <ChevronRight size={16} className="text-zinc-500" />
        ) : (
          <ChevronDown size={16} className="text-zinc-500" />
        )}
        <Link size={16} className="text-zinc-500" />
        <span className="text-zinc-500 text-xs">
          Dipendenze{totalCount > 0 && ` (${totalCount})`}
        </span>
      </button>

      {!collapsed && (
        <div className="ml-7 space-y-3">
          {loading && <span className="text-xs text-zinc-600">Caricamento...</span>}

          {deps && (
            <>
              {renderSection("Blocca", deps.blocking)}
              {renderSection("Bloccato da", deps.blocked_by)}
              {renderSection("Correlati", deps.relates_to)}

              {totalCount === 0 && !loading && (
                <span className="text-xs text-zinc-600">Nessuna dipendenza</span>
              )}
            </>
          )}

          {/* Add form */}
          {showForm ? (
            <div className="space-y-2 bg-zinc-800/50 rounded-lg p-2">
              <select
                value={depType}
                onChange={e => setDepType(e.target.value)}
                className="w-full bg-zinc-900 rounded px-2 py-1.5 text-xs text-zinc-300 outline-none cursor-pointer"
              >
                {DEP_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} className="bg-zinc-800">
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="relative" ref={dropdownRef}>
                <input
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Cerca task..."
                  className="w-full bg-zinc-900 rounded px-2 py-1.5 text-xs text-zinc-300 outline-none placeholder-zinc-600"
                />
                {showDropdown && searchQuery.length > 0 && (
                  <div className="absolute top-8 left-0 right-0 z-50 bg-zinc-800 border border-zinc-700 rounded-lg max-h-40 overflow-y-auto shadow-xl">
                    {filteredTasks.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-zinc-500">Nessun task trovato</div>
                    ) : (
                      filteredTasks.slice(0, 10).map(t => (
                        <button
                          key={t.id}
                          onClick={() => handleAdd(t.id)}
                          disabled={submitting}
                          className="w-full px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-700 truncate disabled:opacity-50"
                        >
                          {t.title}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => { setShowForm(false); setSearchQuery(""); setShowDropdown(false); }}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Annulla
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Plus size={12} />
              Aggiungi dipendenza
            </button>
          )}
        </div>
      )}
    </div>
  );
}
