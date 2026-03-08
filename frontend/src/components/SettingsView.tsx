"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, Download, Upload, FileJson, FileSpreadsheet, CheckCircle2, LogOut, UserPlus, Copy, Check, RefreshCw, Calendar, HardDrive, Mail, Clock, Key, Smartphone } from "lucide-react";
import { getVapidKey, subscribePush, unsubscribePush, sendTestPush, importTasks, getGoogleCalendarConfig, triggerGoogleSync, triggerBackup, listBackups, getProfile, updatePreferences, generateApiKey, revokeApiKey } from "@/lib/api";

function getApiUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8000/api";
  return `http://${window.location.hostname}:8000/api`;
}

export default function SettingsView({ onLogout }: { onLogout?: () => void }) {
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [gcalConfigured, setGcalConfigured] = useState(false);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalMessage, setGcalMessage] = useState("");
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backups, setBackups] = useState<{ name: string; size: number; created: string }[]>([]);
  const [backupConfigured, setBackupConfigured] = useState(false);
  const [reportEmail, setReportEmail] = useState(false);
  const [reportPush, setReportPush] = useState(false);
  const [reportTime, setReportTime] = useState("07:00");
  const [reportSaving, setReportSaving] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);

  useEffect(() => {
    getGoogleCalendarConfig()
      .then((cfg) => setGcalConfigured(cfg.configured))
      .catch(() => {});
    listBackups()
      .then((res) => { setBackups(res.backups); setBackupConfigured(res.configured); })
      .catch(() => {});
    getProfile()
      .then((p) => {
        setReportEmail(p.daily_report_email);
        setReportPush(p.daily_report_push);
        setReportTime(p.daily_report_time || "07:00");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(supported);
    if (supported) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      });
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = "/login";
    }
  }

  function handleCopyInvite() {
    const url = `http://${window.location.hostname}:${window.location.port || 3000}/login`;
    const text = `Ciao! Ti invito a usare MyActivity per gestire task e abitudini insieme.\n\nRegistrati qui: ${url}\n\nDopo la registrazione, potro condividere le liste con te.`;
    navigator.clipboard.writeText(text).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  }

  async function handleTogglePush() {
    setPushLoading(true);
    setPushMessage("");
    try {
      if (pushEnabled) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const keys = sub.toJSON().keys || {};
          await unsubscribePush(sub.endpoint, keys.p256dh || "", keys.auth || "");
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        setPushMessage("Notifiche push disattivate");
      } else {
        const { public_key } = await getVapidKey();
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key),
        });
        const keys = sub.toJSON().keys || {};
        await subscribePush(sub.endpoint, keys.p256dh || "", keys.auth || "");
        setPushEnabled(true);
        setPushMessage("Notifiche push attivate!");
      }
    } catch (err) {
      setPushMessage("Errore: " + (err instanceof Error ? err.message : "sconosciuto"));
    } finally {
      setPushLoading(false);
    }
  }

  async function handleTestPush() {
    setPushMessage("");
    try {
      const result = await sendTestPush();
      setPushMessage(result.detail);
    } catch (err) {
      setPushMessage("Errore: " + (err instanceof Error ? err.message : "sconosciuto"));
    }
  }

  async function handleExport(type: "tasks" | "habits", fmt: "json" | "csv") {
    const url = `${getApiUrl()}/export/${type}?fmt=${fmt}`;
    const token = localStorage.getItem("token");
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${type}.${fmt}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage("");
    try {
      const result = await importTasks(file);
      setImportMessage(`Importati ${result.tasks_imported} task` + (result.errors.length > 0 ? ` (${result.errors.length} errori)` : ""));
    } catch (err) {
      setImportMessage("Errore: " + (err instanceof Error ? err.message : "sconosciuto"));
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-white">Impostazioni</h2>

      {/* Invite family */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <UserPlus size={16} />
          Invita famiglia
        </h3>
        <p className="text-xs text-zinc-500">
          Copia il messaggio di invito e invialo ai tuoi famigliari tramite WhatsApp, Telegram o email. Dopo la registrazione, potrai condividere le liste con loro dal menu contestuale della lista.
        </p>
        <button
          onClick={handleCopyInvite}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-colors"
        >
          {inviteCopied ? <Check size={16} /> : <Copy size={16} />}
          {inviteCopied ? "Copiato!" : "Copia invito"}
        </button>
      </div>

      {/* Google Calendar */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Calendar size={16} />
          Google Calendar
        </h3>
        {gcalConfigured ? (
          <>
            <p className="text-xs text-zinc-500">
              I task della lista <span className="text-zinc-300 font-medium">Family</span> vengono sincronizzati automaticamente con il calendario Google condiviso. Usa il pulsante per forzare una sincronizzazione completa.
            </p>
            <button
              onClick={async () => {
                setGcalSyncing(true);
                setGcalMessage("");
                try {
                  const result = await triggerGoogleSync();
                  setGcalMessage(`Sincronizzazione completata: ${result.pushed} inviati, ${result.pulled} ricevuti`);
                } catch (err) {
                  setGcalMessage("Errore: " + (err instanceof Error ? err.message : "sconosciuto"));
                } finally {
                  setGcalSyncing(false);
                }
              }}
              disabled={gcalSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
            >
              <RefreshCw size={16} className={gcalSyncing ? "animate-spin" : ""} />
              {gcalSyncing ? "Sincronizzazione..." : "Sincronizza ora"}
            </button>
            {gcalMessage && <p className="text-xs text-zinc-400">{gcalMessage}</p>}
          </>
        ) : (
          <p className="text-xs text-zinc-500">
            Google Calendar non configurato. Contatta l'amministratore per abilitare la sincronizzazione.
          </p>
        )}
      </div>

      {/* Backup */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <HardDrive size={16} />
          Backup Database
        </h3>
        {backupConfigured ? (
          <>
            <p className="text-xs text-zinc-500">
              Backup automatico ogni giorno alle 03:00 su Google Drive. Gli ultimi 7 backup vengono mantenuti.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  setBackupRunning(true);
                  setBackupMessage("");
                  try {
                    await triggerBackup();
                    setBackupMessage("Backup avviato. Potrebbe richiedere qualche minuto.");
                    // Refresh list after a delay
                    setTimeout(() => {
                      listBackups().then((res) => setBackups(res.backups)).catch(() => {});
                    }, 10000);
                  } catch (err) {
                    setBackupMessage("Errore: " + (err instanceof Error ? err.message : "sconosciuto"));
                  } finally {
                    setBackupRunning(false);
                  }
                }}
                disabled={backupRunning}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
              >
                <RefreshCw size={16} className={backupRunning ? "animate-spin" : ""} />
                {backupRunning ? "In corso..." : "Backup ora"}
              </button>
            </div>
            {backupMessage && <p className="text-xs text-zinc-400">{backupMessage}</p>}
            {backups.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Ultimi backup</span>
                {backups.slice(0, 5).map((b) => (
                  <div key={b.name} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">{b.name}</span>
                    <span className="text-zinc-600">{(b.size / 1024).toFixed(1)} KB</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-zinc-500">
            Backup su Google Drive non configurato. Imposta GOOGLE_DRIVE_FOLDER_ID nelle variabili d'ambiente.
          </p>
        )}
      </div>

      {/* Push Notifications */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Bell size={16} />
          Notifiche Push
        </h3>
        {!pushSupported ? (
          <p className="text-xs text-zinc-500">Le notifiche push non sono supportate su questo browser.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <button
                onClick={handleTogglePush}
                disabled={pushLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pushEnabled
                    ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                    : "bg-blue-600 text-white hover:bg-blue-500"
                } disabled:opacity-50`}
              >
                {pushEnabled ? <BellOff size={16} /> : <Bell size={16} />}
                {pushLoading ? "..." : pushEnabled ? "Disattiva" : "Attiva notifiche"}
              </button>
              {pushEnabled && (
                <button
                  onClick={handleTestPush}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-300 transition-colors"
                >
                  Invia test
                </button>
              )}
            </div>
            {pushMessage && (
              <p className="text-xs text-zinc-400">{pushMessage}</p>
            )}
          </>
        )}
      </div>

      {/* Daily Report */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Mail size={16} />
          Report giornaliero
        </h3>
        <p className="text-xs text-zinc-500">
          Ricevi ogni mattina un riepilogo dei task in scadenza oggi, domani e in ritardo. Scegli come riceverlo e a che ora.
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={reportEmail}
              onChange={(e) => setReportEmail(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm text-zinc-300">Invia via email</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={reportPush}
              onChange={(e) => setReportPush(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm text-zinc-300">Notifica push sul telefono</span>
          </label>
          <div className="flex items-center gap-3">
            <Clock size={16} className="text-zinc-500" />
            <span className="text-sm text-zinc-400">Orario invio:</span>
            <input
              type="time"
              value={reportTime}
              onChange={(e) => setReportTime(e.target.value)}
              className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <button
          onClick={async () => {
            setReportSaving(true);
            setReportMessage("");
            try {
              await updatePreferences({
                daily_report_email: reportEmail,
                daily_report_push: reportPush,
                daily_report_time: reportTime,
              });
              setReportMessage("Preferenze salvate!");
              setTimeout(() => setReportMessage(""), 3000);
            } catch (err) {
              setReportMessage("Errore: " + (err instanceof Error ? err.message : "sconosciuto"));
            } finally {
              setReportSaving(false);
            }
          }}
          disabled={reportSaving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
        >
          {reportSaving ? "Salvataggio..." : "Salva preferenze"}
        </button>
        {reportMessage && <p className="text-xs text-zinc-400">{reportMessage}</p>}
      </div>

      {/* Export */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Download size={16} />
          Esporta dati
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">Task</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport("tasks", "json")}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs text-zinc-300 transition-colors"
              >
                <FileJson size={14} /> JSON
              </button>
              <button
                onClick={() => handleExport("tasks", "csv")}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs text-zinc-300 transition-colors"
              >
                <FileSpreadsheet size={14} /> CSV
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">Abitudini</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport("habits", "json")}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs text-zinc-300 transition-colors"
              >
                <FileJson size={14} /> JSON
              </button>
              <button
                onClick={() => handleExport("habits", "csv")}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs text-zinc-300 transition-colors"
              >
                <FileSpreadsheet size={14} /> CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Import */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Upload size={16} />
          Importa task
        </h3>
        <p className="text-xs text-zinc-500">
          Carica un file JSON esportato per importare i task. I task verranno creati come nuovi (gli ID originali vengono ignorati).
        </p>
        <label className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-300 cursor-pointer transition-colors">
          <Upload size={16} />
          {importing ? "Importazione..." : "Scegli file JSON"}
          <input type="file" accept=".json" onChange={handleImport} className="hidden" disabled={importing} />
        </label>
        {importMessage && (
          <p className="text-xs text-zinc-400 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-green-400" />
            {importMessage}
          </p>
        )}
      </div>

      {/* API Key for iOS Shortcuts */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Smartphone size={16} />
          Tasto Azione iPhone
        </h3>
        <p className="text-xs text-zinc-500">
          Genera una API key per aggiungere task velocemente dal Tasto Azione dell'iPhone tramite Comandi Rapidi.
          Endpoint: <code className="text-zinc-400">POST /api/shortcut/task</code> con header <code className="text-zinc-400">X-API-Key</code>.
        </p>
        {apiKey ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-zinc-900 px-3 py-2 rounded text-xs text-zinc-300 font-mono break-all">{apiKey}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(apiKey);
                  setApiKeyCopied(true);
                  setTimeout(() => setApiKeyCopied(false), 2000);
                }}
                className="p-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
              >
                {apiKeyCopied ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-zinc-400" />}
              </button>
            </div>
            <button
              onClick={async () => { await revokeApiKey(); setApiKey(null); }}
              className="px-3 py-1.5 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg text-xs transition-colors"
            >
              Revoca chiave
            </button>
          </div>
        ) : (
          <button
            onClick={async () => {
              const res = await generateApiKey();
              setApiKey(res.api_key);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-colors"
          >
            <Key size={16} />
            Genera API Key
          </button>
        )}
      </div>

      {/* Logout */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg text-sm font-medium transition-colors"
        >
          <LogOut size={16} />
          Esci dall'account
        </button>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    arr[i] = rawData.charCodeAt(i);
  }
  return arr.buffer as ArrayBuffer;
}
