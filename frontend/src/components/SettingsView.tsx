"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, Download, Upload, FileJson, FileSpreadsheet, CheckCircle2, LogOut, UserPlus, Copy, Check, RefreshCw, Calendar, HardDrive, Mail, Clock, Key, Smartphone, Bookmark, Trash2, Link2, Plus, X, Cloud } from "lucide-react";
import { getVapidKey, subscribePush, unsubscribePush, sendTestPush, importTasks, importTickTick, getGoogleCalendarConfig, triggerGoogleSync, triggerBackup, listBackups, getProfile, updatePreferences, generateApiKey, revokeApiKey, exportBlob, logout, getTemplates, deleteTemplate, getJiraConfigs, createJiraConfig, deleteJiraConfig, triggerJiraSync, getJiraProjects, getProjects, createProject, getLists } from "@/lib/api";
import type { TickTickImportResult } from "@/lib/api";
import type { TaskList, TaskTemplate, JiraConfig, JiraProject, Project } from "@/types";
import { useToast } from "@/components/Toast";
import TempoSettingsPanel from "@/components/TempoSettingsPanel";
import TempoUsersPanel from "@/components/TempoUsersPanel";
import TempoImportPanel from "@/components/TempoImportPanel";

export default function SettingsView({ onLogout }: { onLogout?: () => void }) {
  const { showToast } = useToast();
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
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [ticktickImporting, setTicktickImporting] = useState(false);
  const [ticktickMessage, setTicktickMessage] = useState("");
  // Jira
  const [jiraConfigs, setJiraConfigs] = useState<JiraConfig[]>([]);
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [zenoProjects, setZenoProjects] = useState<Project[]>([]);
  const [showJiraAdd, setShowJiraAdd] = useState(false);
  const [newJiraKey, setNewJiraKey] = useState("");
  const [newZenoProjectId, setNewZenoProjectId] = useState<number | "">("");
  const [newDefaultListId, setNewDefaultListId] = useState<number | "">("");
  const [jiraLoading, setJiraLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [allLists, setAllLists] = useState<TaskList[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getGoogleCalendarConfig()
      .then((cfg) => setGcalConfigured(cfg.configured))
      .catch((e) => { if (e.message !== "Non autorizzato") showToast("Errore caricamento config Google Calendar"); });
    listBackups()
      .then((res) => { setBackups(res.backups); setBackupConfigured(res.configured); })
      .catch((e) => { if (e.message !== "Non autorizzato") showToast("Errore caricamento backup"); });
    getProfile()
      .then((p) => {
        setReportEmail(p.daily_report_email);
        setReportPush(p.daily_report_push);
        setReportTime(p.daily_report_time || "07:00");
        setIsAdmin(p.is_admin);
      })
      .catch((e) => { if (e.message !== "Non autorizzato") showToast("Errore caricamento profilo"); });
    getTemplates()
      .then(setTemplates)
      .catch((e) => { if (e.message !== "Non autorizzato") showToast("Errore caricamento template"); });
    getJiraConfigs()
      .then(setJiraConfigs)
      .catch(() => {});
    getProjects()
      .then(setZenoProjects)
      .catch(() => {});
    getLists()
      .then(setAllLists)
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

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // ignore - cookie may already be gone
    }
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = "/login";
    }
  }

  function handleCopyInvite() {
    const url = `${window.location.origin}/login`;
    const text = `Ciao! Ti invito a usare Zeno per gestire task e abitudini insieme.\n\nRegistrati qui: ${url}\n\nDopo la registrazione, potro condividere le liste con te.`;
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
    try {
      const blob = await exportBlob(`/export/${type}?fmt=${fmt}`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${type}.${fmt}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // silently fail
    }
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

      {/* Import TickTick */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Upload size={16} />
          Importa da TickTick
        </h3>
        <p className="text-xs text-zinc-500">
          Esporta i tuoi task da TickTick (Settings &gt; Backup &gt; Generate Backup) e carica qui il file CSV.
          Vengono importati: task, subtask, liste, tag, ricorrenze e priorità.
        </p>
        <label className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm text-white cursor-pointer transition-colors">
          <Upload size={16} />
          {ticktickImporting ? "Importazione..." : "Scegli file CSV TickTick"}
          <input
            type="file"
            accept=".csv"
            className="hidden"
            disabled={ticktickImporting}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setTicktickImporting(true);
              setTicktickMessage("");
              try {
                const res: TickTickImportResult = await importTickTick(file);
                const parts = [`${res.tasks_imported} task`];
                if (res.subtasks_imported > 0) parts.push(`${res.subtasks_imported} subtask`);
                if (res.lists_created > 0) parts.push(`${res.lists_created} liste create`);
                if (res.tags_created > 0) parts.push(`${res.tags_created} tag`);
                if (res.recurrences_created > 0) parts.push(`${res.recurrences_created} ricorrenze`);
                if (res.skipped > 0) parts.push(`${res.skipped} ignorati`);
                setTicktickMessage(`Importati: ${parts.join(", ")}` + (res.errors.length > 0 ? ` (${res.errors.length} errori)` : ""));
              } catch (err) {
                setTicktickMessage("Errore: " + (err instanceof Error ? err.message : "sconosciuto"));
              } finally {
                setTicktickImporting(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        {ticktickMessage && (
          <p className="text-xs text-zinc-400 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-green-400" />
            {ticktickMessage}
          </p>
        )}
      </div>

      {/* Task Templates */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Bookmark size={16} />
          Template task
        </h3>
        <p className="text-xs text-zinc-500">
          I template vengono creati dal dettaglio di un task. Puoi usarli per creare velocemente task con subtask e ricorrenze preconfigurate.
        </p>
        {templates.length === 0 ? (
          <p className="text-xs text-zinc-600">Nessun template salvato.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between bg-zinc-900 rounded-lg px-3 py-2">
                <div>
                  <div className="text-xs text-zinc-300">{t.name}</div>
                  <div className="text-[10px] text-zinc-500">
                    {t.title}
                    {t.subtask_titles && t.subtask_titles.length > 0 && ` · ${t.subtask_titles.length} subtask`}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await deleteTemplate(t.id);
                      setTemplates(prev => prev.filter(tp => tp.id !== t.id));
                      showToast("Template eliminato", "success");
                    } catch {
                      showToast("Errore nell'eliminazione del template");
                    }
                  }}
                  className="text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Jira Sync */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Link2 size={16} />
          Jira Sync
        </h3>
        <p className="text-xs text-zinc-500">
          Collega progetti Jira a progetti Zeno per sincronizzare automaticamente i task.
        </p>

        {jiraConfigs.length > 0 && (
          <div className="space-y-2">
            {jiraConfigs.map((cfg) => (
              <div key={cfg.id} className="flex items-center justify-between bg-zinc-900 rounded-lg px-3 py-2">
                <div className="flex-1">
                  <div className="text-xs text-zinc-300">
                    <span className="font-mono font-medium">{cfg.jira_project_key}</span>
                    <span className="text-zinc-500 mx-1">→</span>
                    {cfg.zeno_project_name || `Progetto #${cfg.zeno_project_id}`}
                    {cfg.default_list_name && (
                      <span className="text-zinc-500 text-[10px] ml-1">({cfg.default_list_name})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                      cfg.last_sync_status === "ok" ? "bg-green-400" :
                      cfg.last_sync_status === "error" ? "bg-red-400" :
                      cfg.last_sync_status === "running" ? "bg-yellow-400" :
                      "bg-zinc-600"
                    }`} />
                    <span className="text-[10px] text-zinc-500">
                      {cfg.last_sync_status === "ok" ? "OK" :
                       cfg.last_sync_status === "error" ? "Errore" :
                       cfg.last_sync_status === "running" ? "In corso" :
                       "Mai sincronizzato"}
                      {cfg.task_count_synced > 0 && ` · ${cfg.task_count_synced} task`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={async () => {
                      try {
                        await triggerJiraSync(cfg.id);
                        showToast("Sync avviato", "success");
                        setTimeout(() => getJiraConfigs().then(setJiraConfigs).catch(() => {}), 5000);
                      } catch { showToast("Errore avvio sync"); }
                    }}
                    className="p-1.5 text-zinc-500 hover:text-blue-400 transition-colors"
                    title="Sincronizza ora"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await deleteJiraConfig(cfg.id);
                        setJiraConfigs(prev => prev.filter(c => c.id !== cfg.id));
                        showToast("Mapping eliminato", "success");
                      } catch { showToast("Errore eliminazione mapping"); }
                    }}
                    className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showJiraAdd ? (
          <div className="bg-zinc-900 rounded-lg p-3 space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 block mb-1">Progetto Jira</label>
                {jiraProjects.length > 0 ? (
                  <select
                    value={newJiraKey}
                    onChange={(e) => setNewJiraKey(e.target.value)}
                    className="w-full bg-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-300 outline-none"
                  >
                    <option value="">Seleziona...</option>
                    {jiraProjects.map(p => (
                      <option key={p.key} value={p.key}>{p.key} - {p.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={newJiraKey}
                    onChange={(e) => setNewJiraKey(e.target.value.toUpperCase())}
                    placeholder="es. VE"
                    className="w-full bg-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-300 outline-none placeholder-zinc-600"
                  />
                )}
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 block mb-1">Progetto Zeno</label>
                {creatingProject ? (
                  <div className="flex gap-1">
                    <input
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Nome progetto"
                      autoFocus
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && newProjectName.trim()) {
                          try {
                            const p = await createProject({ name: newProjectName.trim() });
                            setZenoProjects(prev => [...prev, p]);
                            setNewZenoProjectId(p.id);
                            setCreatingProject(false);
                            setNewProjectName("");
                            showToast("Progetto creato", "success");
                          } catch { showToast("Errore creazione progetto"); }
                        } else if (e.key === "Escape") {
                          setCreatingProject(false);
                          setNewProjectName("");
                        }
                      }}
                      className="flex-1 bg-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-300 outline-none placeholder-zinc-600"
                    />
                    <button
                      onClick={async () => {
                        if (!newProjectName.trim()) return;
                        try {
                          const p = await createProject({ name: newProjectName.trim() });
                          setZenoProjects(prev => [...prev, p]);
                          setNewZenoProjectId(p.id);
                          setCreatingProject(false);
                          setNewProjectName("");
                          showToast("Progetto creato", "success");
                        } catch { showToast("Errore creazione progetto"); }
                      }}
                      className="px-2 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={() => { setCreatingProject(false); setNewProjectName(""); }}
                      className="px-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <select
                    value={newZenoProjectId}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setCreatingProject(true);
                      } else {
                        setNewZenoProjectId(e.target.value ? Number(e.target.value) : "");
                      }
                    }}
                    className="w-full bg-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-300 outline-none"
                  >
                    <option value="">Seleziona...</option>
                    {zenoProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    <option value="__new__">+ Nuovo progetto...</option>
                  </select>
                )}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Lista di default</label>
              <select
                value={newDefaultListId}
                onChange={(e) => setNewDefaultListId(e.target.value ? Number(e.target.value) : "")}
                className="w-full bg-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-300 outline-none"
              >
                <option value="">Prima lista disponibile</option>
                {allLists.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!newJiraKey || !newZenoProjectId) return;
                  setJiraLoading(true);
                  try {
                    const cfg = await createJiraConfig({
                      jira_project_key: newJiraKey,
                      zeno_project_id: Number(newZenoProjectId),
                      default_list_id: newDefaultListId ? Number(newDefaultListId) : undefined,
                    });
                    setJiraConfigs(prev => [...prev, cfg]);
                    setShowJiraAdd(false);
                    setNewJiraKey("");
                    setNewZenoProjectId("");
                    setNewDefaultListId("");
                    showToast("Mapping creato", "success");
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : "Errore creazione mapping");
                  } finally {
                    setJiraLoading(false);
                  }
                }}
                disabled={jiraLoading || !newJiraKey || !newZenoProjectId}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-xs text-white transition-colors"
              >
                {jiraLoading ? "..." : "Salva"}
              </button>
              <button
                onClick={() => { setShowJiraAdd(false); setNewJiraKey(""); setNewZenoProjectId(""); setNewDefaultListId(""); }}
                className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300 transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={async () => {
              setShowJiraAdd(true);
              if (jiraProjects.length === 0) {
                try {
                  const res = await getJiraProjects();
                  setJiraProjects(res.projects);
                } catch {
                  // Jira not configured or error, user can type manually
                }
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs text-zinc-300 transition-colors"
          >
            <Plus size={14} />
            Aggiungi mapping
          </button>
        )}
      </div>

      {/* Tempo Cloud — admin only */}
      {isAdmin && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 space-y-5">
          <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Cloud size={16} />
            Tempo Cloud
          </h3>
          <p className="text-xs text-zinc-500">
            Importa worklogs da Tempo Cloud per avere visibilità completa delle ore di tutto il team nei report.
          </p>
          <TempoSettingsPanel />
          <div className="border-t border-zinc-700/50 pt-4">
            <TempoImportPanel />
          </div>
          <div className="border-t border-zinc-700/50 pt-4">
            <TempoUsersPanel />
          </div>
        </div>
      )}

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
