"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Download, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { triggerTempoImport, getTempoImportHistory, getTempoImportDetail } from "@/lib/api";
import type { TempoImportLog } from "@/types";
import { useToast } from "@/components/Toast";

export default function TempoImportPanel() {
  const { showToast } = useToast();
  const [history, setHistory] = useState<TempoImportLog[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [importing, setImporting] = useState(false);
  const [pollingId, setPollingId] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getTempoImportHistory().then(setHistory).catch(() => {});
  }, []);

  // Set default dates
  useEffect(() => {
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 7);
    setDateTo(today.toISOString().slice(0, 10));
    setDateFrom(lastWeek.toISOString().slice(0, 10));
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPollingId(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  function startPolling(id: number) {
    setPollingId(id);
    pollingRef.current = setInterval(async () => {
      try {
        const detail = await getTempoImportDetail(id);
        setHistory(prev => prev.map(h => h.id === id ? detail : h));
        if (detail.status !== "running") {
          stopPolling();
          if (detail.status === "ok") {
            showToast(`Import completato: ${detail.worklogs_created} creati, ${detail.worklogs_updated} aggiornati`, "success");
          } else {
            showToast(`Import terminato con errore: ${detail.error_message || "sconosciuto"}`);
          }
        }
      } catch {
        stopPolling();
      }
    }, 3000);
  }

  async function handleImport() {
    if (!dateFrom || !dateTo) return;
    setImporting(true);
    try {
      const result = await triggerTempoImport(dateFrom, dateTo);
      setHistory(prev => [result, ...prev]);
      if (result.status === "running") {
        startPolling(result.id);
        showToast("Import avviato in background...", "success");
      } else if (result.status === "ok") {
        showToast(`Import completato: ${result.worklogs_created} creati, ${result.worklogs_updated} aggiornati`, "success");
      } else {
        showToast(`Import terminato con errore: ${result.error_message || "sconosciuto"}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore avvio import");
    } finally {
      setImporting(false);
    }
  }

  function setPreset(preset: "week" | "month" | "year") {
    const today = new Date();
    setDateTo(today.toISOString().slice(0, 10));
    if (preset === "week") {
      const d = new Date(today);
      d.setDate(today.getDate() - 7);
      setDateFrom(d.toISOString().slice(0, 10));
    } else if (preset === "month") {
      const d = new Date(today);
      d.setMonth(today.getMonth() - 1);
      setDateFrom(d.toISOString().slice(0, 10));
    } else {
      setDateFrom(`${today.getFullYear()}-01-01`);
    }
  }

  function statusIcon(status: string) {
    switch (status) {
      case "ok": return <CheckCircle2 size={14} className="text-green-400" />;
      case "error": return <XCircle size={14} className="text-red-400" />;
      case "running": return <Loader2 size={14} className="text-yellow-400 animate-spin" />;
      default: return <Clock size={14} className="text-zinc-500" />;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Download size={16} className="text-blue-400" />
        <span className="text-sm text-zinc-300">Import Worklogs</span>
      </div>

      {/* Period selection */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-zinc-500 block mb-1">Da</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-zinc-500 block mb-1">A</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setPreset("week")} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] text-zinc-400 transition-colors">
            Ultima settimana
          </button>
          <button onClick={() => setPreset("month")} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] text-zinc-400 transition-colors">
            Ultimo mese
          </button>
          <button onClick={() => setPreset("year")} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] text-zinc-400 transition-colors">
            Da inizio anno
          </button>
        </div>
      </div>

      <button
        onClick={handleImport}
        disabled={importing || !dateFrom || !dateTo || pollingId !== null}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors"
      >
        {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {importing ? "Avvio import..." : "Avvia Import"}
      </button>

      {/* Progress for running import */}
      {pollingId && history.find(h => h.id === pollingId && h.status === "running") && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-yellow-400">
            <Loader2 size={14} className="animate-spin" />
            Import in corso...
          </div>
          {(() => {
            const running = history.find(h => h.id === pollingId);
            if (!running) return null;
            return (
              <div className="text-[10px] text-zinc-400 mt-1">
                Trovati: {running.worklogs_found} | Creati: {running.worklogs_created} | Aggiornati: {running.worklogs_updated} | Skippati: {running.worklogs_skipped}
              </div>
            );
          })()}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Storico import</span>
          {history.slice(0, 10).map(log => (
            <div key={log.id} className="bg-zinc-900 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon(log.status)}
                  <span className="text-xs text-zinc-300">
                    {new Date(log.started_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    {" "}
                    {new Date(log.started_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500">
                  {log.period_from} → {log.period_to}
                </span>
              </div>
              {log.status === "ok" && (
                <div className="text-[10px] text-zinc-500 mt-1">
                  {log.worklogs_found} trovati · {log.worklogs_created} creati · {log.worklogs_updated} aggiornati
                  {log.worklogs_skipped > 0 && ` · ${log.worklogs_skipped} skippati`}
                </div>
              )}
              {log.status === "error" && log.error_message && (
                <div className="text-[10px] text-red-400/70 mt-1 truncate">{log.error_message}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
