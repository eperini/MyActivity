"use client";

import { useState, useEffect } from "react";
import { RefreshCw, CheckCircle2, XCircle, Cloud } from "lucide-react";
import { getTempoConfig, testTempoConnection } from "@/lib/api";
import type { TempoConfig } from "@/types";

export default function TempoSettingsPanel() {
  const [config, setConfig] = useState<TempoConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    getTempoConfig().then(setConfig).catch(() => {});
  }, []);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testTempoConnection();
      setTestResult({ ok: res.status === "ok", message: res.message });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Errore connessione" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud size={16} className="text-blue-400" />
          <span className="text-sm text-zinc-300">Stato connessione</span>
        </div>
        {config && (
          <span className={`text-xs px-2 py-0.5 rounded ${config.is_configured ? "bg-green-900/30 text-green-400" : "bg-zinc-700 text-zinc-400"}`}>
            {config.is_configured ? "Configurato" : "Non configurato"}
          </span>
        )}
      </div>

      {config && config.is_configured && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-zinc-900 rounded-lg px-3 py-2">
            <div className="text-zinc-500">Utenti Tempo</div>
            <div className="text-zinc-200 font-medium">{config.total_tempo_users}</div>
          </div>
          <div className="bg-zinc-900 rounded-lg px-3 py-2">
            <div className="text-zinc-500">Log importati</div>
            <div className="text-zinc-200 font-medium">{config.total_imported_logs}</div>
          </div>
          <div className="bg-zinc-900 rounded-lg px-3 py-2">
            <div className="text-zinc-500">Sync automatica</div>
            <div className="text-zinc-200 font-medium">Ogni {config.sync_interval_days} giorni</div>
          </div>
          <div className="bg-zinc-900 rounded-lg px-3 py-2">
            <div className="text-zinc-500">Ultima sync</div>
            <div className="text-zinc-200 font-medium">
              {config.last_auto_sync_at
                ? new Date(config.last_auto_sync_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
                : "Mai"}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors"
        >
          <RefreshCw size={14} className={testing ? "animate-spin" : ""} />
          {testing ? "Test in corso..." : "Test connessione"}
        </button>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 text-xs ${testResult.ok ? "text-green-400" : "text-red-400"}`}>
          {testResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {testResult.message}
        </div>
      )}

      {config && !config.is_configured && (
        <p className="text-xs text-zinc-500">
          Per configurare Tempo Cloud, imposta <code className="text-zinc-400">TEMPO_API_TOKEN</code> nelle variabili d&apos;ambiente del backend.
        </p>
      )}
    </div>
  );
}
