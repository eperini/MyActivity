"use client";

import { useEffect, useState } from "react";
import type { ProjectCustomField, FieldType } from "@/types";
import { getProjectFields, createProjectField, updateProjectField, deleteProjectField } from "@/lib/api";
import { useToast } from "./Toast";
import { Plus, Trash2, GripVertical, Pencil, X, Check } from "lucide-react";

interface CustomFieldEditorProps {
  projectId: number;
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Testo",
  number: "Numero",
  date: "Data",
  select: "Selezione",
  multi_select: "Selezione multipla",
  boolean: "Si/No",
  url: "URL",
};

const FIELD_TYPES: FieldType[] = ["text", "number", "date", "select", "multi_select", "boolean", "url"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export default function CustomFieldEditor({ projectId }: CustomFieldEditorProps) {
  const { showToast } = useToast();
  const [fields, setFields] = useState<ProjectCustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [newOptions, setNewOptions] = useState("");
  const [newRequired, setNewRequired] = useState(false);
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editOptions, setEditOptions] = useState("");
  const [editRequired, setEditRequired] = useState(false);

  useEffect(() => {
    loadFields();
  }, [projectId]);

  async function loadFields() {
    setLoading(true);
    try {
      const f = await getProjectFields(projectId);
      setFields(f.sort((a, b) => a.position - b.position));
    } catch (e) {
      if (e instanceof Error && e.message !== "Non autorizzato") {
        showToast("Errore caricamento campi");
      }
    } finally {
      setLoading(false);
    }
  }

  function resetAddForm() {
    setNewName("");
    setNewKey("");
    setNewType("text");
    setNewOptions("");
    setNewRequired(false);
    setKeyManuallyEdited(false);
    setShowAddForm(false);
  }

  async function handleAdd() {
    if (!newName.trim()) {
      showToast("Il nome del campo e' obbligatorio");
      return;
    }
    const key = (newKey || slugify(newName)).trim();
    if (!key) {
      showToast("La chiave del campo e' obbligatoria");
      return;
    }

    const data: Partial<ProjectCustomField> = {
      name: newName.trim(),
      field_key: key,
      field_type: newType,
      is_required: newRequired,
      position: fields.length,
    };

    if ((newType === "select" || newType === "multi_select") && newOptions.trim()) {
      data.options = newOptions.split(",").map((o) => o.trim()).filter(Boolean);
    }

    try {
      const created = await createProjectField(projectId, data);
      setFields((prev) => [...prev, created]);
      resetAddForm();
      showToast("Campo aggiunto", "success");
    } catch {
      showToast("Errore nella creazione del campo");
    }
  }

  function startEdit(field: ProjectCustomField) {
    setEditingId(field.id);
    setEditName(field.name);
    setEditOptions((field.options || []).join(", "));
    setEditRequired(field.is_required);
  }

  async function handleSaveEdit(field: ProjectCustomField) {
    const data: Partial<ProjectCustomField> = {
      name: editName.trim() || field.name,
      is_required: editRequired,
    };
    if (field.field_type === "select" || field.field_type === "multi_select") {
      data.options = editOptions.split(",").map((o) => o.trim()).filter(Boolean);
    }
    try {
      const updated = await updateProjectField(projectId, field.id, data);
      setFields((prev) => prev.map((f) => (f.id === field.id ? updated : f)));
      setEditingId(null);
      showToast("Campo aggiornato", "success");
    } catch {
      showToast("Errore nell'aggiornamento del campo");
    }
  }

  async function handleDelete(fieldId: number) {
    try {
      await deleteProjectField(projectId, fieldId);
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      showToast("Campo eliminato", "success");
    } catch {
      showToast("Errore nell'eliminazione del campo");
    }
  }

  if (loading) {
    return <div className="text-zinc-500 text-xs py-4">Caricamento campi...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Campi Custom</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs transition-colors"
        >
          <Plus size={14} />
          Aggiungi campo
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-zinc-800/50 rounded-lg p-4 space-y-3 border border-zinc-700">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Nome</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (!keyManuallyEdited) setNewKey(slugify(e.target.value));
                }}
                placeholder="es. Budget, Stato review..."
                className="w-full bg-zinc-900 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Chiave</label>
              <input
                value={newKey}
                onChange={(e) => { setNewKey(e.target.value); setKeyManuallyEdited(true); }}
                placeholder="auto-generata"
                className="w-full bg-zinc-900 rounded px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Tipo</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as FieldType)}
                className="w-full bg-zinc-900 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600 cursor-pointer"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-zinc-900">{FIELD_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 flex items-end">
              <label className="flex items-center gap-2 cursor-pointer py-1.5">
                <button
                  type="button"
                  onClick={() => setNewRequired(!newRequired)}
                  className={`w-8 h-4.5 rounded-full transition-colors relative ${
                    newRequired ? "bg-blue-600" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      newRequired ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span className="text-xs text-zinc-400">Obbligatorio</span>
              </label>
            </div>
          </div>

          {(newType === "select" || newType === "multi_select") && (
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Opzioni (separate da virgola)</label>
              <input
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                placeholder="es. Opzione 1, Opzione 2, Opzione 3"
                className="w-full bg-zinc-900 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={resetAddForm}
              className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Annulla
            </button>
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs transition-colors"
            >
              Crea campo
            </button>
          </div>
        </div>
      )}

      {/* Fields list */}
      {fields.length === 0 && !showAddForm && (
        <div className="text-center py-8 text-zinc-500 text-xs">
          Nessun campo custom definito. Aggiungi campi per personalizzare i task di questo progetto.
        </div>
      )}

      <div className="space-y-1">
        {fields.map((field) => (
          <div
            key={field.id}
            className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2.5 group"
          >
            <GripVertical size={14} className="text-zinc-600 flex-shrink-0" />

            {editingId === field.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <button
                      type="button"
                      onClick={() => setEditRequired(!editRequired)}
                      className={`w-7 h-4 rounded-full transition-colors relative ${
                        editRequired ? "bg-blue-600" : "bg-zinc-700"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                          editRequired ? "translate-x-3.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <span className="text-[10px] text-zinc-500">Req</span>
                  </label>
                </div>
                {(field.field_type === "select" || field.field_type === "multi_select") && (
                  <input
                    value={editOptions}
                    onChange={(e) => setEditOptions(e.target.value)}
                    placeholder="Opzioni separate da virgola"
                    className="w-full bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                  />
                )}
                <div className="flex justify-end gap-1">
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <X size={14} />
                  </button>
                  <button
                    onClick={() => handleSaveEdit(field)}
                    className="p-1 text-green-500 hover:text-green-400 transition-colors"
                  >
                    <Check size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-200 truncate">{field.name}</span>
                    {field.is_required && (
                      <span className="text-[10px] text-red-400 flex-shrink-0">obbligatorio</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                    <span className="font-mono">{field.field_key}</span>
                    <span>{FIELD_TYPE_LABELS[field.field_type]}</span>
                    {field.options && field.options.length > 0 && (
                      <span>({field.options.length} opzioni)</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(field)}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(field.id)}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
