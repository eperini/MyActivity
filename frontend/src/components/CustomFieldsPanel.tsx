"use client";

import { useEffect, useState } from "react";
import type { Task, ProjectCustomField } from "@/types";
import { getProjectFields } from "@/lib/api";
import { useToast } from "./Toast";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

interface CustomFieldsPanelProps {
  task: Task;
  projectId: number;
  onUpdate: (customFields: Record<string, unknown>) => void;
}

export default function CustomFieldsPanel({ task, projectId, onUpdate }: CustomFieldsPanelProps) {
  const { showToast } = useToast();
  const [fields, setFields] = useState<ProjectCustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const values: Record<string, unknown> = task.custom_fields || {};

  useEffect(() => {
    setLoading(true);
    getProjectFields(projectId)
      .then((f) => setFields(f.sort((a, b) => a.position - b.position)))
      .catch((e) => {
        if (e.message !== "Non autorizzato") showToast("Errore caricamento campi custom");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading) return null;
  if (fields.length === 0) return null;

  function handleChange(key: string, value: unknown) {
    const updated = { ...values, [key]: value };
    onUpdate(updated);
  }

  function handleMultiSelectToggle(key: string, option: string) {
    const raw = values[key];
    const current = Array.isArray(raw) ? raw.filter((o): o is string => typeof o === "string") : [];
    const updated = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    handleChange(key, updated);
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        <span className="text-xs uppercase tracking-wider">Campi Custom</span>
      </button>

      {!collapsed && (
        <div className="ml-2 space-y-3">
          {fields.map((field) => (
            <div key={field.id} className="space-y-1">
              <label className="text-xs text-zinc-400 flex items-center gap-1">
                {field.name}
                {field.is_required && <span className="text-red-400">*</span>}
              </label>

              {field.field_type === "text" && (() => {
                const val = values[field.field_key];
                const strVal = typeof val === "string" ? val : "";
                return (
                <input
                  type="text"
                  value={strVal}
                  onChange={(e) => handleChange(field.field_key, e.target.value)}
                  onBlur={(e) => handleChange(field.field_key, e.target.value)}
                  className="w-full bg-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                  placeholder={`Inserisci ${field.name.toLowerCase()}...`}
                />
                );
              })()}

              {field.field_type === "number" && (() => {
                const val = values[field.field_key];
                const numVal = typeof val === "number" ? val : "";
                return (
                <input
                  type="number"
                  value={numVal}
                  onChange={(e) => handleChange(field.field_key, e.target.value === "" ? null : Number(e.target.value))}
                  className="w-full bg-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                  placeholder="0"
                />
                );
              })()}

              {field.field_type === "date" && (() => {
                const val = values[field.field_key];
                const strVal = typeof val === "string" ? val : "";
                return (
                <input
                  type="date"
                  value={strVal}
                  onChange={(e) => handleChange(field.field_key, e.target.value || null)}
                  className="w-full bg-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600 [color-scheme:dark]"
                />
                );
              })()}

              {field.field_type === "select" && (() => {
                const val = values[field.field_key];
                const strVal = typeof val === "string" ? val : "";
                return (
                <select
                  value={strVal}
                  onChange={(e) => handleChange(field.field_key, e.target.value || null)}
                  className="w-full bg-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600 cursor-pointer"
                >
                  <option value="" className="bg-zinc-800">-- Seleziona --</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt} className="bg-zinc-800">{opt}</option>
                  ))}
                </select>
                );
              })()}

              {field.field_type === "multi_select" && (
                <div className="flex flex-wrap gap-1">
                  {(field.options || []).map((opt) => {
                    const raw = values[field.field_key];
                    const selected = (Array.isArray(raw) ? raw.filter((o): o is string => typeof o === "string") : []).includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => handleMultiSelectToggle(field.field_key, opt)}
                        className={`px-2 py-0.5 rounded text-xs transition-colors ${
                          selected
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {field.field_type === "boolean" && (
                <button
                  onClick={() => handleChange(field.field_key, !values[field.field_key])}
                  className="flex items-center gap-2"
                >
                  <div
                    className={`w-8 h-4.5 rounded-full transition-colors relative ${
                      values[field.field_key] ? "bg-blue-600" : "bg-zinc-700"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                        values[field.field_key] ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                  <span className="text-xs text-zinc-400">
                    {values[field.field_key] ? "Si" : "No"}
                  </span>
                </button>
              )}

              {field.field_type === "url" && (() => {
                const val = values[field.field_key];
                const strVal = typeof val === "string" ? val : "";
                return (
                <div className="flex items-center gap-1">
                  <input
                    type="url"
                    value={strVal}
                    onChange={(e) => handleChange(field.field_key, e.target.value)}
                    onBlur={(e) => handleChange(field.field_key, e.target.value)}
                    className="flex-1 bg-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
                    placeholder="https://..."
                  />
                  {strVal ? (
                    <a
                      href={strVal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-500 hover:text-blue-400 transition-colors flex-shrink-0"
                    >
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
