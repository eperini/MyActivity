"use client";

import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Calendar, Flag, List, Repeat, Trash2, X, Tag as TagIcon, MessageCircle, UserCircle, Send, ListChecks, Bookmark, Plus, ExternalLink, Link2, Unlink } from "lucide-react";
import type { Task, TaskList, RecurrenceRule, Tag, TaskComment, ListMember } from "@/types";
import { formatRelativeDate, isOverdue } from "@/lib/dates";
import { getRecurrence, getRecurrencePreview, deleteRecurrence, getTags, addTagToTask, removeTagFromTask, createTag, getComments, addComment, deleteComment, getListMembers, updateTask as apiUpdateTask, getSubtasks, createSubtask, toggleSubtask, deleteTask as apiDeleteTask, createTemplateFromTask, pushTaskToJira, unlinkTaskFromJira } from "@/lib/api";
import CustomFieldsPanel from "./CustomFieldsPanel";
import DependenciesPanel from "./DependenciesPanel";
import TimeLogPanel from "./TimeLogPanel";
import ReminderPanel from "./ReminderPanel";
import { useToast } from "@/components/Toast";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import DatePicker from "./DatePicker";

interface TaskDetailProps {
  task: Task;
  list?: TaskList;
  lists?: TaskList[];
  onClose: () => void;
  onUpdate: (id: number, data: Partial<Task>) => void;
  onDelete: (id: number) => void;
  onRefresh?: () => void;
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

export default function TaskDetail({ task, list, lists, onClose, onUpdate, onDelete, onRefresh }: TaskDetailProps) {
  const { showToast } = useToast();
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[4];
  const overdue = task.due_date ? isOverdue(task.due_date) : false;

  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);
  const [previewDates, setPreviewDates] = useState<string[]>([]);
  const [loadingRec, setLoadingRec] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Tags
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  // Comments
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);

  // Assignment
  const [members, setMembers] = useState<ListMember[]>([]);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);

  // Subtasks
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  // Template
  const [showTemplateName, setShowTemplateName] = useState(false);
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    getTags().then(setAllTags).catch((e) => { if (e.message !== "Non autorizzato") showToast("Errore caricamento tag"); });
    getComments(task.id).then(setComments).catch((e) => { if (e.message !== "Non autorizzato") showToast("Errore caricamento commenti"); });
    getListMembers(task.list_id).then(setMembers).catch((e) => { if (e.message !== "Non autorizzato") showToast("Errore caricamento membri"); });
    getSubtasks(task.id).then(setSubtasks).catch((e) => { if (e.message !== "Non autorizzato") showToast("Errore caricamento subtask"); });
  }, [task.id, task.list_id]);

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
    try {
      await deleteRecurrence(task.id);
      setRecurrence(null);
      setPreviewDates([]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore eliminazione ricorrenza");
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-zinc-900 flex flex-col md:relative md:inset-auto md:z-auto md:w-80 md:h-full md:border-l md:border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft size={20} className="md:hidden" />
          <X size={18} className="hidden md:block" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplateName(!showTemplateName)}
            className="text-zinc-400 hover:text-blue-400 transition-colors"
            title="Salva come template"
          >
            <Bookmark size={18} />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="text-zinc-400 hover:text-red-400 transition-colors"
          >
            <Trash2 size={20} className="md:w-[18px] md:h-[18px]" />
          </button>
        </div>
      </div>

      {/* Template name prompt */}
      {showTemplateName && (
        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-800/50 flex items-center gap-2">
          <input
            autoFocus
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Nome template..."
            className="flex-1 bg-zinc-900 rounded px-3 py-1.5 text-xs text-zinc-300 outline-none"
            onKeyDown={async (e) => {
              if (e.key === "Enter" && templateName.trim()) {
                try {
                  await createTemplateFromTask(task.id, templateName.trim());
                  showToast("Template salvato!", "success");
                  setShowTemplateName(false);
                  setTemplateName("");
                } catch {
                  showToast("Errore nel salvataggio del template");
                }
              }
              if (e.key === "Escape") {
                setShowTemplateName(false);
                setTemplateName("");
              }
            }}
          />
          <button
            onClick={() => { setShowTemplateName(false); setTemplateName(""); }}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X size={14} />
          </button>
        </div>
      )}

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
            if (val !== (task.description || "")) onUpdate(task.id, { description: val || null });
          }}
        />

        {/* Meta */}
        <div className="space-y-3">
          {/* List */}
          <div className="flex items-center gap-3 text-sm">
            <List size={16} className="text-zinc-500" />
            {lists && lists.length > 0 ? (
              <select
                value={task.list_id}
                onChange={(e) => onUpdate(task.id, { list_id: Number(e.target.value) } as Partial<Task>)}
                className="bg-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none cursor-pointer"
                style={{ color: list?.color || "#d4d4d8" }}
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id} style={{ color: l.color }} className="bg-zinc-800">
                    {l.name}
                  </option>
                ))}
              </select>
            ) : list && (
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: list.color }} />
                <span className="text-zinc-300">{list.name}</span>
              </span>
            )}
          </div>

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
                  onChange={(d) => onUpdate(task.id, { due_date: d } as Partial<Task>)}
                  onTimeChange={(t) => onUpdate(task.id, { due_time: t } as Partial<Task>)}
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

          {/* Subtasks */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <ListChecks size={16} className="text-zinc-500" />
              <span className="text-zinc-500 text-xs">
                Subtask{subtasks.length > 0 && ` (${subtasks.filter(s => s.status === "done").length}/${subtasks.length})`}
              </span>
            </div>

            {subtasks.length > 0 && (
              <div className="ml-7 mb-2">
                <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${(subtasks.filter(s => s.status === "done").length / subtasks.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="ml-7 space-y-1">
              {subtasks.map((sub) => (
                <div key={sub.id} className="flex items-center gap-2 group/sub">
                  <button
                    onClick={async () => {
                      try {
                        const updated = await toggleSubtask(task.id, sub.id);
                        setSubtasks(prev => prev.map(s => s.id === sub.id ? updated : s));
                        onRefresh?.();
                      } catch {
                        showToast("Errore nell'aggiornamento del subtask");
                      }
                    }}
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                      sub.status === "done" ? "bg-zinc-600 border-zinc-600" : "border-zinc-600"
                    }`}
                  >
                    {sub.status === "done" && (
                      <svg width="8" height="6" viewBox="0 0 10 8" fill="none" className="text-white">
                        <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 text-xs ${sub.status === "done" ? "line-through text-zinc-500" : "text-zinc-300"}`}>
                    {sub.title}
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        await apiDeleteTask(sub.id);
                        setSubtasks(prev => prev.filter(s => s.id !== sub.id));
                        onRefresh?.();
                      } catch {
                        showToast("Errore nell'eliminazione del subtask");
                      }
                    }}
                    className="opacity-0 group-hover/sub:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {/* Add subtask input */}
              <div className="flex items-center gap-2">
                <Plus size={14} className="text-zinc-600 flex-shrink-0" />
                <input
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Aggiungi subtask..."
                  className="flex-1 bg-transparent text-xs text-zinc-300 outline-none placeholder-zinc-600"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && newSubtaskTitle.trim()) {
                      try {
                        const sub = await createSubtask(task.id, { title: newSubtaskTitle.trim() });
                        setSubtasks(prev => [...prev, sub]);
                        setNewSubtaskTitle("");
                        onRefresh?.();
                      } catch {
                        showToast("Errore nella creazione del subtask");
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <TagIcon size={16} className="text-zinc-500" />
              <span className="text-zinc-500 text-xs">Tag</span>
            </div>
            <div className="ml-7 flex flex-wrap gap-1">
              {task.tags && task.tags.map(tag => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                  style={{ backgroundColor: tag.color + "20", color: tag.color }}
                >
                  #{tag.name}
                  <button
                    onClick={async () => {
                      try {
                        await removeTagFromTask(task.id, tag.id);
                        onRefresh?.();
                      } catch {
                        showToast("Errore rimozione tag");
                      }
                    }}
                    className="hover:opacity-70"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <div className="relative">
                <button
                  onClick={() => setShowTagDropdown(!showTagDropdown)}
                  className="px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
                >
                  + tag
                </button>
                {showTagDropdown && (
                  <div className="absolute top-7 left-0 z-50 bg-zinc-800 border border-zinc-700 rounded-lg p-2 w-48 space-y-1 shadow-xl">
                    {allTags
                      .filter(t => !task.tags?.some(tt => tt.id === t.id))
                      .map(tag => (
                        <button
                          key={tag.id}
                          onClick={async () => {
                            try {
                              await addTagToTask(task.id, tag.id);
                              setShowTagDropdown(false);
                              onRefresh?.();
                            } catch {
                              showToast("Errore aggiunta tag");
                            }
                          }}
                          className="flex items-center gap-2 w-full px-2 py-1 rounded text-xs text-zinc-300 hover:bg-zinc-700"
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </button>
                      ))}
                    <div className="flex gap-1 pt-1 border-t border-zinc-700">
                      <input
                        value={newTagName}
                        onChange={e => setNewTagName(e.target.value)}
                        placeholder="Nuovo tag..."
                        className="flex-1 bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-300 outline-none"
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && newTagName.trim()) {
                            try {
                              const colors = ["#3b82f6","#ef4444","#22c55e","#f59e0b","#8b5cf6","#ec4899","#06b6d4"];
                              const color = colors[Math.floor(Math.random() * colors.length)];
                              const tag = await createTag({ name: newTagName.trim(), color });
                              await addTagToTask(task.id, tag.id);
                              setAllTags(prev => [...prev, tag]);
                              setNewTagName("");
                              setShowTagDropdown(false);
                              onRefresh?.();
                            } catch {
                              showToast("Errore creazione tag");
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <UserCircle size={16} className="text-zinc-500" />
              <span className="text-zinc-500 text-xs">Assegnato a</span>
            </div>
            <div className="ml-7 relative">
              <button
                onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                className="px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              >
                {task.assigned_to_name || "Nessuno"}
              </button>
              {showAssignDropdown && (
                <div className="absolute top-8 left-0 z-50 bg-zinc-800 border border-zinc-700 rounded-lg p-1 w-44 shadow-xl">
                  <button
                    onClick={async () => {
                      onUpdate(task.id, { assigned_to: null } as Partial<Task>);
                      setShowAssignDropdown(false);
                    }}
                    className="w-full px-2 py-1.5 rounded text-xs text-zinc-400 hover:bg-zinc-700 text-left"
                  >
                    Nessuno
                  </button>
                  {members.map(m => (
                    <button
                      key={m.user_id}
                      onClick={async () => {
                        onUpdate(task.id, { assigned_to: m.user_id } as Partial<Task>);
                        setShowAssignDropdown(false);
                      }}
                      className={`w-full px-2 py-1.5 rounded text-xs text-left hover:bg-zinc-700 ${
                        task.assigned_to === m.user_id ? "text-blue-400" : "text-zinc-300"
                      }`}
                    >
                      {m.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Custom Fields */}
          {task.project_id && (
            <CustomFieldsPanel
              task={task}
              projectId={task.project_id}
              onUpdate={(customFields) => onUpdate(task.id, { custom_fields: customFields } as Partial<Task>)}
            />
          )}

          {/* Reminders */}
          <ReminderPanel taskId={task.id} hasDueDate={!!task.due_date} />

          {/* Time Tracking */}
          <TimeLogPanel
            taskId={task.id}
            estimatedMinutes={task.estimated_minutes}
            timeLoggedMinutes={task.time_logged_minutes}
            onRefresh={onRefresh}
          />

          {/* Dependencies */}
          <DependenciesPanel taskId={task.id} />

          {/* Jira */}
          {task.project_id && (
            <JiraSection task={task} onRefresh={onRefresh} />
          )}
        </div>

        {/* Comments */}
        <div className="border-t border-zinc-800 pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <MessageCircle size={16} />
            <span className="text-xs">Commenti ({comments.length})</span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {comments.map(c => (
              <div key={c.id} className="bg-zinc-800/50 rounded-lg p-2.5 space-y-1 group/comment">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300">{c.user_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-600">
                      {c.created_at ? format(parseISO(c.created_at), "d MMM HH:mm", { locale: it }) : ""}
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          await deleteComment(task.id, c.id);
                          setComments(prev => prev.filter(cc => cc.id !== c.id));
                        } catch {
                          showToast("Errore eliminazione commento");
                        }
                      }}
                      className="opacity-0 group-hover/comment:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                      title="Elimina commento"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-zinc-400">{c.text}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Scrivi un commento..."
              className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-600"
              onKeyDown={async (e) => {
                if (e.key === "Enter" && newComment.trim() && !sendingComment) {
                  setSendingComment(true);
                  try {
                    const c = await addComment(task.id, newComment.trim());
                    setComments(prev => [...prev, c]);
                    setNewComment("");
                  } catch {
                    showToast("Errore invio commento");
                  } finally {
                    setSendingComment(false);
                  }
                }
              }}
            />
            <button
              onClick={async () => {
                if (!newComment.trim() || sendingComment) return;
                setSendingComment(true);
                try {
                  const c = await addComment(task.id, newComment.trim());
                  setComments(prev => [...prev, c]);
                  setNewComment("");
                } catch {
                  showToast("Errore invio commento");
                } finally {
                  setSendingComment(false);
                }
              }}
              disabled={sendingComment || !newComment.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Send size={14} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JiraSection({ task, onRefresh }: { task: Task; onRefresh?: () => void }) {
  const { showToast } = useToast();
  const [pushing, setPushing] = useState(false);

  async function handlePush() {
    setPushing(true);
    try {
      const result = await pushTaskToJira(task.id);
      showToast(`Sincronizzato: ${result.jira_key}`, "success");
      onRefresh?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore push Jira");
    } finally {
      setPushing(false);
    }
  }

  async function handleUnlink() {
    try {
      await unlinkTaskFromJira(task.id);
      showToast("Task scollegato da Jira", "success");
      onRefresh?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore unlink Jira");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm">
        <Link2 size={16} className="text-zinc-500" />
        <span className="text-zinc-500 text-xs">Jira</span>
      </div>
      <div className="ml-7 space-y-2">
        {task.jira_issue_key ? (
          <>
            <div className="flex items-center gap-2">
              <a
                href={task.jira_url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                {task.jira_issue_key}
                <ExternalLink size={10} />
              </a>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePush}
                disabled={pushing}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-xs text-white transition-colors"
              >
                {pushing ? "Sincronizzazione..." : "Push su Jira"}
              </button>
              <button
                onClick={handleUnlink}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-400 transition-colors flex items-center gap-1"
              >
                <Unlink size={10} />
                Scollega
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={handlePush}
            disabled={pushing}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-xs text-white transition-colors"
          >
            {pushing ? "Creazione..." : "Crea issue su Jira"}
          </button>
        )}
      </div>
    </div>
  );
}
