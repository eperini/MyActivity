"use client";

import { useState, useEffect } from "react";
import { RefreshCw, CheckCircle2, XCircle, Cloud, Upload } from "lucide-react";
import { getTempoConfig, testTempoConnection, triggerTempoPush, getTempoPushPending, getTempoPushHistory } from "@/lib/api";
import type { TempoConfig, TempoPushLog } from "@/types";
import { useToast } from "@/components/Toast";

export default function TempoSettingsPanel() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<TempoConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [noJiraCount, setNoJiraCount] = useState(0);
  const [lastPush, setLastPush] = useState<TempoPushLog | null>(null);

  useEffect(() => {
    getTempoConfig().then(setConfig).catch(() => {});
    getTempoPushPending()
      .then(res => {
        setPendingCount(res.total);
        setNoJiraCount(res.logs.filter(l => !l.has_jira).length);
      })
      .catch(() => {});
    getTempoPushHistory()
      .then(logs => { if (logs.length > 0) setLastPush(logs[0]); })
      .catch(() => {});
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

  async function handlePush() {
    setPushing(true);
    try {
      const res = await triggerTempoPush();
      setLastPush(res);
      setPendingCount(0);
      if (res.status === "ok" || res.status === "partial") {
        showToast(`Push completato: ${res.logs_pushed} pushati, ${res.logs_updated} aggiornati`, "success");
      } else {
        showToast(`Push completato con errore: ${res.error_message || "sconosciuto"}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Errore push");
    } finally {
      setPushing(false);
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

      {/* Push section */}
      {config && config.is_configured && (
        <div className="border-t border-zinc-700/50 pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-blue-400" />
            <span className="text-sm text-zinc-300">Push ore Zeno → Tempo</span>
          </div>
          <p className="text-[10px] text-zinc-500">
            Sync automatica ogni notte alle 02:00
          </p>

          {lastPush && (
            <div className="text-xs text-zinc-400">
              Ultimo push: {lastPush.started_at ? new Date(lastPush.started_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
              {" "}
              {lastPush.status === "ok" && <span className="text-green-400">{lastPush.logs_pushed} pushati</span>}
              {lastPush.status === "partial" && <span className="text-yellow-400">{lastPush.logs_pushed} pushati, {lastPush.logs_error} errori</span>}
              {lastPush.status === "error" && <span className="text-red-400">Errore</span>}
            </div>
          )}

          {pendingCount > 0 && (
            <div className="text-xs text-zinc-400">
              In attesa di push: <span className="text-zinc-200">{pendingCount} log</span>
              {noJiraCount > 0 && <span className="text-yellow-400/70"> (di cui {noJiraCount} senza Jira)</span>}
            </div>
          )}

          <button
            onClick={handlePush}
            disabled={pushing || pendingCount === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors"
          >
            <Upload size={14} className={pushing ? "animate-bounce" : ""} />
            {pushing ? "Push in corso..." : "Esegui push ora"}
          </button>
        </div>
      )}
    </div>
  );
}
