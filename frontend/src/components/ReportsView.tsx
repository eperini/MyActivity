"use client";

import { useState, useEffect } from "react";
import { FileBarChart, Download, Trash2, Plus, Clock, CheckCircle2, AlertCircle, FileText, Table2 } from "lucide-react";
import type { Project, ReportHistoryItem, ReportType, ReportGenerateResult } from "@/types";
import {
  generateReport, getReportHistory, deleteReportHistory,
  getReportClients, getProjects, exportBlob,
} from "@/lib/api";
import { useToast } from "./Toast";

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
}

type PeriodPreset = "this_week" | "last_week" | "this_month" | "last_month" | "custom";

function getPresetDates(preset: PeriodPreset): { from: string; to: string } {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? 6 : day - 1;

  switch (preset) {
    case "this_week": {
      const monday = new Date(today);
      monday.setDate(today.getDate() - diff);
      return { from: fmt(monday), to: fmt(today) };
    }
    case "last_week": {
      const lastMonday = new Date(today);
      lastMonday.setDate(today.getDate() - diff - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { from: fmt(lastMonday), to: fmt(lastSunday) };
    }
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(first), to: fmt(today) };
    }
    case "last_month": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(first), to: fmt(last) };
    }
    default:
      return { from: fmt(today), to: fmt(today) };
  }
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default function ReportsView() {
  const { showToast } = useToast();

  // Form state
  const [reportType, setReportType] = useState<ReportType>("project");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [targetProjectId, setTargetProjectId] = useState<number | "">("");
  const [targetClientName, setTargetClientName] = useState("");
  const [title, setTitle] = useState("");
  const [formatPdf, setFormatPdf] = useState(true);
  const [formatExcel, setFormatExcel] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<ReportGenerateResult | null>(null);

  // Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const dates = getPresetDates(periodPreset);
    setPeriodFrom(dates.from);
    setPeriodTo(dates.to);
  }, [periodPreset]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [p, c, h] = await Promise.all([
        getProjects(),
        getReportClients(),
        getReportHistory(),
      ]);
      setProjects(p);
      setClients(c);
      setHistory(h);
    } catch {
      showToast("Errore caricamento dati", "error");
    }
  }

  async function handleGenerate() {
    const formats: string[] = [];
    if (formatPdf) formats.push("pdf");
    if (formatExcel) formats.push("excel");
    if (!formats.length) {
      showToast("Seleziona almeno un formato", "error");
      return;
    }

    setGenerating(true);
    try {
      const result = await generateReport({
        report_type: reportType,
        period_from: periodFrom,
        period_to: periodTo,
        target_project_id: reportType === "project" && targetProjectId ? Number(targetProjectId) : undefined,
        target_client_name: reportType === "client" ? targetClientName : undefined,
        target_user_id: reportType === "person" ? undefined : undefined, // current user is implied
        title: title || undefined,
        formats,
      });
      setLastResult(result);
      showToast("Report generato!", "success");
      setShowForm(false);
      loadData();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Errore generazione", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload(id: number, format: "pdf" | "excel") {
    try {
      const blob = await exportBlob(`/reports/history/${id}/download/${format}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report.${format === "pdf" ? "pdf" : "xlsx"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Errore download", "error");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteReportHistory(id);
      setHistory(h => h.filter(r => r.id !== id));
      showToast("Report eliminato", "success");
    } catch {
      showToast("Errore eliminazione", "error");
    }
  }

  const typeLabels: Record<ReportType, string> = {
    person: "Per persona",
    project: "Per progetto",
    client: "Per cliente",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileBarChart className="w-6 h-6 text-blue-400" />
          <h1 className="text-xl font-bold text-white">Report</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
        >
          <Plus className="w-4 h-4" />
          Genera Report
        </button>
      </div>

      {/* Generate form */}
      {showForm && (
        <div className="bg-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Genera Report</h2>

          {/* Report type */}
          <div>
            <label className="text-sm text-zinc-400 block mb-2">Tipo</label>
            <div className="flex gap-3">
              {(["project", "client", "person"] as ReportType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setReportType(t)}
                  className={`px-4 py-2 rounded-lg text-sm ${
                    reportType === t
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  {typeLabels[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Target selector */}
          {reportType === "project" && (
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Progetto</label>
              <select
                value={targetProjectId}
                onChange={e => setTargetProjectId(e.target.value ? Number(e.target.value) : "")}
                className="w-full bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Seleziona progetto...</option>
                {projects.filter(p => p.status !== "archived").map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          {reportType === "client" && (
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Cliente</label>
              <select
                value={targetClientName}
                onChange={e => setTargetClientName(e.target.value)}
                className="w-full bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Seleziona cliente...</option>
                {clients.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {/* Period */}
          <div>
            <label className="text-sm text-zinc-400 block mb-2">Periodo</label>
            <div className="flex gap-2 flex-wrap mb-2">
              {([
                ["this_week", "Questa settimana"],
                ["last_week", "Settimana scorsa"],
                ["this_month", "Questo mese"],
                ["last_month", "Mese scorso"],
                ["custom", "Personalizzato"],
              ] as [PeriodPreset, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPeriodPreset(key)}
                  className={`px-3 py-1 rounded text-xs ${
                    periodPreset === key
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <input
                type="date"
                value={periodFrom}
                onChange={e => { setPeriodFrom(e.target.value); setPeriodPreset("custom"); }}
                className="bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
              />
              <span className="text-zinc-400 self-center">—</span>
              <input
                type="date"
                value={periodTo}
                onChange={e => { setPeriodTo(e.target.value); setPeriodPreset("custom"); }}
                className="bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Formats */}
          <div>
            <label className="text-sm text-zinc-400 block mb-2">Formato</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={formatPdf}
                  onChange={e => setFormatPdf(e.target.checked)}
                  className="rounded"
                />
                PDF
              </label>
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={formatExcel}
                  onChange={e => setFormatExcel(e.target.checked)}
                  className="rounded"
                />
                Excel
              </label>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Titolo (opzionale)</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="es. Report mensile cliente X"
              className="w-full bg-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating || (!periodFrom || !periodTo) ||
              (reportType === "project" && !targetProjectId) ||
              (reportType === "client" && !targetClientName)}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-600 text-white rounded-lg font-medium"
          >
            {generating ? "Generazione in corso..." : "Genera Report"}
          </button>

          {/* Result */}
          {lastResult && (
            <div className="bg-zinc-900 rounded-lg p-4 space-y-2">
              <p className="text-green-400 text-sm font-medium">Report generato!</p>
              <p className="text-white text-sm">{lastResult.title}</p>
              <div className="flex gap-4 text-xs text-zinc-400">
                <span>Ore: {fmtMinutes(lastResult.summary.total_logged_minutes)}</span>
                <span>Task completati: {lastResult.summary.total_done_tasks}</span>
                <span>Aperti: {lastResult.summary.total_open_tasks}</span>
                <span>Completamento: {lastResult.summary.avg_completion_pct.toFixed(0)}%</span>
              </div>
              <div className="flex gap-2 mt-2">
                {lastResult.downloads.pdf && (
                  <button
                    onClick={() => handleDownload(lastResult.history_id, "pdf")}
                    className="flex items-center gap-1 px-3 py-1 bg-red-600/20 text-red-400 rounded text-xs hover:bg-red-600/30"
                  >
                    <FileText className="w-3 h-3" /> PDF
                  </button>
                )}
                {lastResult.downloads.excel && (
                  <button
                    onClick={() => handleDownload(lastResult.history_id, "excel")}
                    className="flex items-center gap-1 px-3 py-1 bg-green-600/20 text-green-400 rounded text-xs hover:bg-green-600/30"
                  >
                    <Table2 className="w-3 h-3" /> Excel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Report generati</h2>
        {history.length === 0 && (
          <p className="text-zinc-500 text-sm">Nessun report ancora generato.</p>
        )}
        {history.map(h => (
          <div key={h.id} className="bg-zinc-800 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white font-medium">{h.title || `Report ${typeLabels[h.report_type]}`}</p>
                <p className="text-xs text-zinc-400 mt-1">
                  {new Date(h.generated_at).toLocaleString("it-IT")} &middot; {h.period_from} — {h.period_to}
                </p>
                {h.summary && (
                  <div className="flex gap-3 mt-2 text-xs text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {fmtMinutes(h.summary.total_logged_minutes)}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-400" /> {h.summary.total_done_tasks} completati
                    </span>
                    <span className="flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-yellow-400" /> {h.summary.total_open_tasks} aperti
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {h.has_pdf && (
                  <button
                    onClick={() => handleDownload(h.id, "pdf")}
                    className="p-2 hover:bg-zinc-700 rounded-lg"
                    title="Download PDF"
                  >
                    <FileText className="w-4 h-4 text-red-400" />
                  </button>
                )}
                {h.has_excel && (
                  <button
                    onClick={() => handleDownload(h.id, "excel")}
                    className="p-2 hover:bg-zinc-700 rounded-lg"
                    title="Download Excel"
                  >
                    <Table2 className="w-4 h-4 text-green-400" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(h.id)}
                  className="p-2 hover:bg-zinc-700 rounded-lg"
                  title="Elimina"
                >
                  <Trash2 className="w-4 h-4 text-zinc-500 hover:text-red-400" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
