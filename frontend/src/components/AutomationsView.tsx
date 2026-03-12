"use client";

import { useState, useEffect } from "react";
import type { AutomationRule, TriggerType, ActionType } from "@/types";
import { getAutomations, createAutomation, deleteAutomation, toggleAutomation } from "@/lib/api";
import { useToast } from "./Toast";
import { Plus, Trash2, Zap, ZapOff, ChevronDown, ChevronUp, X } from "lucide-react";

const TRIGGER_LABELS: Record<TriggerType, string> = {
  status_changed: "Cambio stato",
  due_date_passed: "Scadenza superata",
  task_created: "Task creato",
  all_subtasks_done: "Subtask completati",
  assigned_to_changed: "Assegnazione cambiata",
};

const ACTION_LABELS: Record<ActionType, string> = {
  change_status: "Cambia stato",
  assign_to: "Assegna a",
  create_task: "Crea task",
  send_notification: "Invia notifica",
  set_field: "Imposta campo",
};

const STATUS_OPTIONS = [
  { value: "todo", label: "Todo" },
  { value: "doing", label: "In Progress" },
  { value: "done", label: "Done" },
];

interface AutomationsViewProps {
  projectId: number;
}

export default function AutomationsView({ projectId }: AutomationsViewProps) {
  const { showToast } = useToast();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  async function loadRules() {
    try {
      const data = await getAutomations(projectId);
      setRules(data);
    } catch {
      showToast("Errore caricamento automazioni");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRules();
  }, [projectId]);

  async function handleToggle(rule: AutomationRule) {
    try {
      const updated = await toggleAutomation(projectId, rule.id);
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch {
      showToast("Errore toggle automazione");
    }
  }

  async function handleDelete(ruleId: number) {
    try {
      await deleteAutomation(projectId, ruleId);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      setConfirmDeleteId(null);
      showToast("Automazione eliminata");
    } catch {
      showToast("Errore eliminazione automazione");
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Mai";
    const d = new Date(dateStr);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return <div className="text-zinc-500 text-sm py-4">Caricamento automazioni...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Automazioni</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Annulla" : "Nuova automazione"}
        </button>
      </div>

      {showForm && (
        <AutomationRuleForm
          projectId={projectId}
          onCreated={(rule) => {
            setRules((prev) => [...prev, rule]);
            setShowForm(false);
            showToast("Automazione creata");
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {rules.length === 0 && !showForm && (
        <div className="text-center py-8 text-zinc-500 text-sm">
          Nessuna automazione configurata
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`rounded-lg border p-3 transition-colors ${
              rule.is_active
                ? "border-zinc-700 bg-zinc-800/50"
                : "border-zinc-800 bg-zinc-900/50 opacity-60"
            }`}
          >
            <div className="flex items-center gap-3">
              {rule.is_active ? (
                <Zap size={16} className="text-yellow-400 shrink-0" />
              ) : (
                <ZapOff size={16} className="text-zinc-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-200 truncate">{rule.name}</div>
                <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
                  <span className="px-1.5 py-0.5 rounded bg-zinc-700/50">
                    {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                  </span>
                  <span className="text-zinc-600">&rarr;</span>
                  <span className="px-1.5 py-0.5 rounded bg-zinc-700/50">
                    {ACTION_LABELS[rule.action_type] || rule.action_type}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-zinc-500 hidden md:block">
                  Ultimo: {formatDate(rule.last_triggered)}
                </span>
                <button
                  onClick={() => handleToggle(rule)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    rule.is_active ? "bg-green-600" : "bg-zinc-600"
                  }`}
                  title={rule.is_active ? "Disattiva" : "Attiva"}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      rule.is_active ? "translate-x-4" : ""
                    }`}
                  />
                </button>
                {confirmDeleteId === rule.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                    >
                      Conferma
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs px-2 py-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(rule.id)}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Elimina"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Inline form ──────────────────────────────────────────────── */

interface AutomationRuleFormProps {
  projectId: number;
  onCreated: (rule: AutomationRule) => void;
  onCancel: () => void;
}

function AutomationRuleForm({ projectId, onCreated, onCancel }: AutomationRuleFormProps) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("status_changed");
  const [actionType, setActionType] = useState<ActionType>("change_status");

  // Trigger config state
  const [fromStatus, setFromStatus] = useState("");
  const [toStatus, setToStatus] = useState("");

  // Action config state
  const [newStatus, setNewStatus] = useState("done");
  const [assignUserId, setAssignUserId] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [createTaskTitle, setCreateTaskTitle] = useState("");

  const [showAdvanced, setShowAdvanced] = useState(false);

  function buildTriggerConfig(): Record<string, unknown> {
    if (triggerType === "status_changed") {
      const cfg: Record<string, unknown> = {};
      if (fromStatus) cfg.from_status = fromStatus;
      if (toStatus) cfg.to_status = toStatus;
      return cfg;
    }
    return {};
  }

  function buildActionConfig(): Record<string, unknown> {
    switch (actionType) {
      case "change_status":
        return { new_status: newStatus };
      case "assign_to":
        return { user_id: Number(assignUserId) || 0 };
      case "send_notification":
        return { message: notificationMessage };
      case "set_field":
        return { field_key: fieldKey, value: fieldValue };
      case "create_task":
        return { title: createTaskTitle };
      default:
        return {};
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      showToast("Inserisci un nome per l'automazione");
      return;
    }
    setSaving(true);
    try {
      const rule = await createAutomation(projectId, {
        name: name.trim(),
        trigger_type: triggerType,
        trigger_config: buildTriggerConfig(),
        action_type: actionType,
        action_config: buildActionConfig(),
      });
      onCreated(rule);
    } catch {
      showToast("Errore creazione automazione");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
      {/* Name */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Nome</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="es. Auto-completa quando subtask finiti"
          className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          maxLength={200}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Trigger */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Trigger (Quando)</label>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value as TriggerType)}
            className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          >
            {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((t) => (
              <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {/* Action */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Azione (Allora)</label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as ActionType)}
            className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          >
            {(Object.keys(ACTION_LABELS) as ActionType[]).map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Trigger config: status_changed */}
      {triggerType === "status_changed" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Configurazione trigger
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-2 gap-3 pl-2">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Da stato (opzionale)</label>
                <select
                  value={fromStatus}
                  onChange={(e) => setFromStatus(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                >
                  <option value="">Qualsiasi</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">A stato (opzionale)</label>
                <select
                  value={toStatus}
                  onChange={(e) => setToStatus(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                >
                  <option value="">Qualsiasi</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action config */}
      <div className="space-y-2">
        {actionType === "change_status" && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Nuovo stato</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        )}

        {actionType === "assign_to" && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">User ID</label>
            <input
              type="number"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              placeholder="ID utente"
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
        )}

        {actionType === "send_notification" && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Messaggio</label>
            <input
              type="text"
              value={notificationMessage}
              onChange={(e) => setNotificationMessage(e.target.value)}
              placeholder="Usa {task_title} per il titolo del task"
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Placeholder disponibili: {"{task_title}"}
            </p>
          </div>
        )}

        {actionType === "set_field" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Campo (field_key)</label>
              <input
                type="text"
                value={fieldKey}
                onChange={(e) => setFieldKey(e.target.value)}
                placeholder="es. priority"
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Valore</label>
              <input
                type="text"
                value={fieldValue}
                onChange={(e) => setFieldValue(e.target.value)}
                placeholder="es. 3"
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>
        )}

        {actionType === "create_task" && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Titolo nuovo task</label>
            <input
              type="text"
              value={createTaskTitle}
              onChange={(e) => setCreateTaskTitle(e.target.value)}
              placeholder="es. Review completata - follow up"
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Crea automazione"}
        </button>
      </div>
    </form>
  );
}
