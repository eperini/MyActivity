import type { Task, TaskList, Habit, HabitLog, HabitStats, RecurrenceRule, TaskInstance, PomodoroSession, PomodoroStats, ListMember, Tag, TaskComment, TaskTemplate, Area, Project, ProjectMember, ProjectStats, ProjectCustomField, TaskDependencies, AutomationRule, Sprint, SprintDetail, TimeLog, WeeklyTimeData, JiraConfig, JiraProject, ReportHistoryItem, ReportConfigItem, ReportGenerateResult, ReportType, TempoUser, TempoImportLog, TempoConfig, TempoPushLog, TempoPendingLog, Epic, QuickLogProject, ProjectInvitation, ZenoNotification } from "@/types";

function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === "undefined") return "http://localhost:8000/api";
  // Use same hostname as browser (works with localhost and Tailscale IP)
  return `http://${window.location.hostname}:8000/api`;
}
const API_URL = getApiUrl();

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 401) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new Error("Non autorizzato");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Errore sconosciuto" }));
    throw new Error(error.detail || "Errore API");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Auth
export async function login(email: string, password: string) {
  return request<{ access_token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string, display_name: string) {
  return request<{ access_token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, display_name }),
  });
}

export async function logout() {
  return request<{ detail: string }>("/auth/logout", { method: "POST" });
}

// Lists
export const getLists = () => request<TaskList[]>("/lists/");
export const createList = (data: { name: string; color?: string }) =>
  request<TaskList>("/lists/", { method: "POST", body: JSON.stringify(data) });
export const updateList = (id: number, data: { name?: string; color?: string }) =>
  request<TaskList>(`/lists/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteList = (id: number) =>
  request<{ detail: string }>(`/lists/${id}`, { method: "DELETE" });
export const reorderLists = (ids: number[]) =>
  request<{ detail: string }>("/lists/reorder", { method: "PATCH", body: JSON.stringify({ ids }) });
export const resetListOrder = () =>
  request<{ detail: string }>("/lists/reset-order", { method: "PATCH" });
export const getListMembers = (listId: number) =>
  request<ListMember[]>(`/lists/${listId}/members`);
export const addListMember = (listId: number, email: string, role = "edit") =>
  request<ListMember>(`/lists/${listId}/members`, { method: "POST", body: JSON.stringify({ email, role }) });
export const removeListMember = (listId: number, memberId: number) =>
  request<{ detail: string }>(`/lists/${listId}/members/${memberId}`, { method: "DELETE" });

// Tasks
export const getTasks = (params?: { list_id?: number; status?: string }) => {
  const query = new URLSearchParams();
  if (params?.list_id) query.set("list_id", String(params.list_id));
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return request<Task[]>(`/tasks/${qs ? `?${qs}` : ""}`);
};

export const createTask = (data: Partial<Task>) =>
  request<Task>("/tasks/", { method: "POST", body: JSON.stringify(data) });

export const updateTask = (id: number, data: Partial<Task>) =>
  request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteTask = (id: number) =>
  request<{ detail: string }>(`/tasks/${id}`, { method: "DELETE" });

export const reorderTasks = (ids: number[]) =>
  request<{ detail: string }>("/tasks/reorder", { method: "PATCH", body: JSON.stringify({ ids }) });

// Subtasks
export const getSubtasks = (taskId: number) =>
  request<Task[]>(`/tasks/${taskId}/subtasks`);
export const createSubtask = (taskId: number, data: { title: string; priority?: number }) =>
  request<Task>(`/tasks/${taskId}/subtasks`, { method: "POST", body: JSON.stringify(data) });
export const toggleSubtask = (taskId: number, subtaskId: number) =>
  request<Task>(`/tasks/${taskId}/subtasks/${subtaskId}/toggle`, { method: "PATCH" });
export const reorderSubtasks = (taskId: number, ids: number[]) =>
  request<{ detail: string }>(`/tasks/${taskId}/subtasks/reorder`, { method: "PATCH", body: JSON.stringify({ ids }) });

// Recurrences
export const setRecurrence = (taskId: number, data: {
  frequency: string;
  interval?: number;
  days_of_week?: number[] | null;
  day_of_month?: number | null;
  month?: number | null;
  nth_weekday?: number | null;
  nth_weekday_day?: number | null;
  workday_adjust?: string;
  workday_target?: number | null;
}) =>
  request<RecurrenceRule>(`/tasks/${taskId}/recurrence`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getRecurrence = (taskId: number) =>
  request<RecurrenceRule>(`/tasks/${taskId}/recurrence`);

export const deleteRecurrence = (taskId: number) =>
  request<{ detail: string }>(`/tasks/${taskId}/recurrence`, { method: "DELETE" });

export const getRecurrencePreview = (taskId: number, count = 5) =>
  request<{ dates: string[] }>(`/tasks/${taskId}/recurrence/preview?count=${count}`);

export const getInstances = (taskId: number) =>
  request<TaskInstance[]>(`/tasks/${taskId}/instances`);

// Habits
export const getHabits = () => request<Habit[]>("/habits/");
export const createHabit = (data: Partial<Habit>) =>
  request<Habit>("/habits/", { method: "POST", body: JSON.stringify(data) });
export const updateHabit = (id: number, data: Partial<Habit>) =>
  request<Habit>(`/habits/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteHabit = (id: number) =>
  request<{ detail: string }>(`/habits/${id}`, { method: "DELETE" });
export const toggleHabitLog = (habitId: number, logDate: string) =>
  request<{ checked: boolean }>(`/habits/${habitId}/toggle`, {
    method: "POST",
    body: JSON.stringify({ log_date: logDate }),
  });
export const getHabitLogs = (habitId: number, year: number, month: number) =>
  request<HabitLog[]>(`/habits/${habitId}/logs?year=${year}&month=${month}`);
export const getHabitStats = (habitId: number) =>
  request<HabitStats>(`/habits/${habitId}/stats`);
export const getWeekLogs = () =>
  request<Record<number, string[]>>("/habits/logs/week");

// Pomodoro
export const createPomodoroSession = (data: {
  task_id?: number | null;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  session_type?: string;
}) =>
  request<PomodoroSession>("/pomodoro/", { method: "POST", body: JSON.stringify(data) });
export const getPomodoroSessions = () =>
  request<PomodoroSession[]>("/pomodoro/");
export const getPomodoroStats = () =>
  request<PomodoroStats>("/pomodoro/stats");

// Push notifications
export const getVapidKey = () =>
  request<{ public_key: string }>("/push/vapid-key");
export const subscribePush = (endpoint: string, p256dh: string, auth: string) =>
  request<{ detail: string }>("/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint, p256dh, auth }),
  });
export const unsubscribePush = (endpoint: string, p256dh: string, auth: string) =>
  request<{ detail: string }>("/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint, p256dh, auth }),
  });
export const sendTestPush = () =>
  request<{ detail: string }>("/push/test", { method: "POST" });

// Export
export const exportTasks = (fmt: "json" | "csv") =>
  request<Blob>(`/export/tasks?fmt=${fmt}`);
export const exportHabits = (fmt: "json" | "csv") =>
  request<Blob>(`/export/habits?fmt=${fmt}`);
export async function exportBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
  });
  if (res.status === 401) {
    if (window.location.pathname !== "/login") window.location.href = "/login";
    throw new Error("Non autorizzato");
  }
  if (!res.ok) throw new Error("Errore export");
  return res.blob();
}

// Import TickTick
export interface TickTickImportResult {
  tasks_imported: number;
  subtasks_imported: number;
  lists_created: number;
  tags_created: number;
  recurrences_created: number;
  skipped: number;
  errors: string[];
}

export async function importTickTick(file: File): Promise<TickTickImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/export/import/ticktick`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (res.status === 401) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") window.location.href = "/login";
    throw new Error("Non autorizzato");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Errore import" }));
    throw new Error(err.detail || "Errore import");
  }
  return res.json();
}

// Import
export async function importTasks(file: File): Promise<{ tasks_imported: number; errors: string[] }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/export/import/tasks`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (res.status === 401) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") window.location.href = "/login";
    throw new Error("Non autorizzato");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Errore import" }));
    throw new Error(err.detail || "Errore import");
  }
  return res.json();
}

// Google Calendar
export const getGoogleCalendarConfig = () =>
  request<{ calendar_id: string; sync_list_id: number; configured: boolean }>("/google/config");
export const triggerGoogleSync = () =>
  request<{ pushed: number; pulled: number }>("/google/sync", { method: "POST" });

// Backup
export const triggerBackup = () =>
  request<{ detail: string; task_id: string }>("/backup/trigger", { method: "POST" });
export const listBackups = () =>
  request<{ backups: { name: string; size: number; created: string }[]; configured: boolean }>("/backup/list");

// Tags
export const getTags = () => request<Tag[]>("/tags/");
export const createTag = (data: { name: string; color: string }) =>
  request<Tag>("/tags/", { method: "POST", body: JSON.stringify(data) });
export const updateTag = (id: number, data: { name?: string; color?: string }) =>
  request<Tag>(`/tags/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteTag = (id: number) =>
  request<{ detail: string }>(`/tags/${id}`, { method: "DELETE" });
export const addTagToTask = (taskId: number, tagId: number) =>
  request<{ detail: string }>(`/tags/tasks/${taskId}/tags/${tagId}`, { method: "POST" });
export const removeTagFromTask = (taskId: number, tagId: number) =>
  request<{ detail: string }>(`/tags/tasks/${taskId}/tags/${tagId}`, { method: "DELETE" });

// Comments
export const getComments = (taskId: number) =>
  request<TaskComment[]>(`/tasks/${taskId}/comments`);
export const addComment = (taskId: number, text: string) =>
  request<TaskComment>(`/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ text }) });
export const deleteComment = (taskId: number, commentId: number) =>
  request<{ detail: string }>(`/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" });

// Templates
export const getTemplates = () => request<TaskTemplate[]>("/templates/");
export const createTemplateFromTask = (taskId: number, name: string) =>
  request<TaskTemplate>(`/templates/from-task/${taskId}`, { method: "POST", body: JSON.stringify({ name }) });
export const deleteTemplate = (id: number) =>
  request<{ detail: string }>(`/templates/${id}`, { method: "DELETE" });
export const instantiateTemplate = (templateId: number, data: { list_id: number; due_date?: string; due_time?: string }) =>
  request<{ id: number; title: string; detail: string }>(`/templates/${templateId}/instantiate`, { method: "POST", body: JSON.stringify(data) });

// Quick add
export const quickAddTask = (text: string, listId: number) =>
  request<Task>("/tasks/quickadd", { method: "POST", body: JSON.stringify({ text, list_id: listId }) });

// API Key (for iOS Shortcuts)
export const generateApiKey = () =>
  request<{ api_key: string }>("/auth/me/api-key", { method: "POST" });
export const revokeApiKey = () =>
  request<{ detail: string }>("/auth/me/api-key", { method: "DELETE" });

// User profile & preferences
export interface UserProfile {
  id: number;
  email: string;
  display_name: string;
  is_admin: boolean;
  daily_report_email: boolean;
  daily_report_push: boolean;
  daily_report_time: string | null;
}
export const getProfile = () => request<UserProfile>("/auth/me");
export const updatePreferences = (data: {
  daily_report_email?: boolean;
  daily_report_push?: boolean;
  daily_report_time?: string;
}) => request<{ detail: string }>("/auth/me/preferences", { method: "PATCH", body: JSON.stringify(data) });

// Areas
export const getAreas = () => request<Area[]>("/areas/");
export const createArea = (data: { name: string; color?: string; icon?: string }) =>
  request<Area>("/areas/", { method: "POST", body: JSON.stringify(data) });
export const updateArea = (id: number, data: { name?: string; color?: string; icon?: string }) =>
  request<Area>(`/areas/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteArea = (id: number) =>
  request<{ detail: string }>(`/areas/${id}`, { method: "DELETE" });
export const reorderAreas = (ids: number[]) =>
  request<{ detail: string }>("/areas/reorder", { method: "PATCH", body: JSON.stringify({ ids }) });

// Projects
export const getProjects = (params?: { area_id?: number; status?: string; project_type?: string }) => {
  const query = new URLSearchParams();
  if (params?.area_id) query.set("area_id", String(params.area_id));
  if (params?.status) query.set("status", params.status);
  if (params?.project_type) query.set("project_type", params.project_type);
  const qs = query.toString();
  return request<Project[]>(`/projects/${qs ? `?${qs}` : ""}`);
};
export const createProject = (data: Partial<Project>) =>
  request<Project>("/projects/", { method: "POST", body: JSON.stringify(data) });
export const getProject = (id: number) => request<Project>(`/projects/${id}`);
export const updateProject = (id: number, data: Partial<Project>) =>
  request<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteProject = (id: number) =>
  request<{ detail: string }>(`/projects/${id}`, { method: "DELETE" });
export const getProjectStats = (id: number) =>
  request<ProjectStats>(`/projects/${id}/stats`);
export const getProjectMembers = (id: number) =>
  request<ProjectMember[]>(`/projects/${id}/members`);
export const addProjectMember = (id: number, email: string, role = "edit") =>
  request<ProjectMember>(`/projects/${id}/members`, { method: "POST", body: JSON.stringify({ email, role }) });
export const removeProjectMember = (projectId: number, memberId: number) =>
  request<{ detail: string }>(`/projects/${projectId}/members/${memberId}`, { method: "DELETE" });

// Custom Fields
export const getProjectFields = (projectId: number) =>
  request<ProjectCustomField[]>(`/projects/${projectId}/fields/`);
export const createProjectField = (projectId: number, data: Partial<ProjectCustomField>) =>
  request<ProjectCustomField>(`/projects/${projectId}/fields/`, { method: "POST", body: JSON.stringify(data) });
export const updateProjectField = (projectId: number, fieldId: number, data: Partial<ProjectCustomField>) =>
  request<ProjectCustomField>(`/projects/${projectId}/fields/${fieldId}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteProjectField = (projectId: number, fieldId: number) =>
  request<{ detail: string }>(`/projects/${projectId}/fields/${fieldId}`, { method: "DELETE" });

// Dependencies
export const getTaskDependencies = (taskId: number) =>
  request<TaskDependencies>(`/tasks/${taskId}/dependencies/`);
export const addTaskDependency = (taskId: number, relatedTaskId: number, dependencyType: string) =>
  request<{ id: number }>(`/tasks/${taskId}/dependencies/`, { method: "POST", body: JSON.stringify({ related_task_id: relatedTaskId, dependency_type: dependencyType }) });
export const removeTaskDependency = (taskId: number, depId: number) =>
  request<{ detail: string }>(`/tasks/${taskId}/dependencies/${depId}`, { method: "DELETE" });

// Automations
export const getAutomations = (projectId: number) =>
  request<AutomationRule[]>(`/projects/${projectId}/automations/`);
export const createAutomation = (projectId: number, data: Partial<AutomationRule>) =>
  request<AutomationRule>(`/projects/${projectId}/automations/`, { method: "POST", body: JSON.stringify(data) });
export const updateAutomation = (projectId: number, ruleId: number, data: Partial<AutomationRule>) =>
  request<AutomationRule>(`/projects/${projectId}/automations/${ruleId}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteAutomation = (projectId: number, ruleId: number) =>
  request<{ detail: string }>(`/projects/${projectId}/automations/${ruleId}`, { method: "DELETE" });
export const toggleAutomation = (projectId: number, ruleId: number) =>
  request<AutomationRule>(`/projects/${projectId}/automations/${ruleId}/toggle`, { method: "PATCH" });

// Sprints
export const getSprints = (projectId: number) =>
  request<Sprint[]>(`/projects/${projectId}/sprints/`);
export const createSprint = (projectId: number, data: Partial<Sprint>) =>
  request<Sprint>(`/projects/${projectId}/sprints/`, { method: "POST", body: JSON.stringify(data) });
export const getSprintDetail = (projectId: number, sprintId: number) =>
  request<SprintDetail>(`/projects/${projectId}/sprints/${sprintId}`);
export const updateSprint = (projectId: number, sprintId: number, data: Partial<Sprint>) =>
  request<Sprint>(`/projects/${projectId}/sprints/${sprintId}`, { method: "PATCH", body: JSON.stringify(data) });
export const addTaskToSprint = (projectId: number, sprintId: number, taskId: number) =>
  request<{ detail: string }>(`/projects/${projectId}/sprints/${sprintId}/tasks`, { method: "POST", body: JSON.stringify({ task_id: taskId }) });
export const removeTaskFromSprint = (projectId: number, sprintId: number, taskId: number) =>
  request<{ detail: string }>(`/projects/${projectId}/sprints/${sprintId}/tasks/${taskId}`, { method: "DELETE" });

// Time Logs
export const getTimeLogs = (taskId: number) =>
  request<TimeLog[]>(`/tasks/${taskId}/time`);
export const createTimeLog = (taskId: number, data: { minutes: number; logged_at?: string; note?: string }) =>
  request<TimeLog>(`/tasks/${taskId}/time`, { method: "POST", body: JSON.stringify(data) });
export const updateTimeLog = (taskId: number, logId: number, data: { minutes?: number; logged_at?: string; note?: string }) =>
  request<TimeLog>(`/tasks/${taskId}/time/${logId}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteTimeLog = (taskId: number, logId: number) =>
  request<{ detail: string }>(`/tasks/${taskId}/time/${logId}`, { method: "DELETE" });
export const getWeeklyTime = () =>
  request<WeeklyTimeData>("/time/week");

// Jira
export const getJiraConfigs = () =>
  request<JiraConfig[]>("/jira/config");
export const createJiraConfig = (data: { jira_project_key: string; zeno_project_id: number; default_list_id?: number }) =>
  request<JiraConfig>("/jira/config", { method: "POST", body: JSON.stringify(data) });
export const updateJiraConfig = (id: number, data: { sync_enabled?: boolean; default_list_id?: number }) =>
  request<JiraConfig>(`/jira/config/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteJiraConfig = (id: number) =>
  request<{ detail: string }>(`/jira/config/${id}`, { method: "DELETE" });
export const triggerJiraSync = (configId: number) =>
  request<{ detail: string }>(`/jira/config/${configId}/sync`, { method: "POST" });
export const getJiraProjects = () =>
  request<{ projects: JiraProject[] }>("/jira/projects");
export const pushTaskToJira = (taskId: number) =>
  request<{ jira_key: string; jira_url: string }>(`/tasks/${taskId}/jira/push`, { method: "POST" });
export const unlinkTaskFromJira = (taskId: number) =>
  request<{ detail: string }>(`/tasks/${taskId}/jira/unlink`, { method: "DELETE" });
export const linkJiraAccount = () =>
  request<{ jira_account_id: string; display_name: string }>("/jira/link-account", { method: "POST" });

// Reports
export const generateReport = (data: {
  report_type: ReportType;
  period_from: string;
  period_to: string;
  target_user_id?: number;
  target_project_id?: number;
  target_client_name?: string;
  title?: string;
  formats?: string[];
}) => request<ReportGenerateResult>("/reports/generate", { method: "POST", body: JSON.stringify(data) });

export const getReportHistory = () =>
  request<ReportHistoryItem[]>("/reports/history");

export const deleteReportHistory = (id: number) =>
  request<{ detail: string }>(`/reports/history/${id}`, { method: "DELETE" });

export const getReportClients = () =>
  request<string[]>("/reports/clients");

export const getReportConfigs = () =>
  request<ReportConfigItem[]>("/reports/configs");

export const createReportConfig = (data: {
  name: string;
  report_type: ReportType;
  frequency: string;
  target_user_id?: number;
  target_project_id?: number;
  target_client_name?: string;
  send_email?: boolean;
  email_to?: string;
}) => request<ReportConfigItem>("/reports/configs", { method: "POST", body: JSON.stringify(data) });

export const updateReportConfig = (id: number, data: {
  name?: string;
  is_active?: boolean;
  send_email?: boolean;
  email_to?: string;
}) => request<ReportConfigItem>(`/reports/configs/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteReportConfig = (id: number) =>
  request<{ detail: string }>(`/reports/configs/${id}`, { method: "DELETE" });

export const runReportConfigNow = (id: number) =>
  request<{ detail: string }>(`/reports/configs/${id}/run-now`, { method: "POST" });

// Users (admin)
export const listUsers = () =>
  request<{ id: number; email: string; display_name: string; is_admin: boolean }[]>("/auth/users");

// Tempo
export const getTempoConfig = () =>
  request<TempoConfig>("/tempo/config");
export const testTempoConnection = () =>
  request<{ status: string; message: string }>("/tempo/test-connection", { method: "POST" });
export const getTempoUsers = () =>
  request<TempoUser[]>("/tempo/users");
export const linkTempoUser = (id: number, zeno_user_id: number | null) =>
  request<TempoUser>(`/tempo/users/${id}`, { method: "PATCH", body: JSON.stringify({ zeno_user_id }) });
export const deactivateTempoUser = (id: number) =>
  request<TempoUser>(`/tempo/users/${id}/deactivate`, { method: "PATCH" });
export const triggerTempoImport = (date_from: string, date_to: string) =>
  request<TempoImportLog>("/tempo/import", { method: "POST", body: JSON.stringify({ date_from, date_to }) });
export const getTempoImportHistory = () =>
  request<TempoImportLog[]>("/tempo/import/history");
export const getTempoImportDetail = (id: number) =>
  request<TempoImportLog>(`/tempo/import/history/${id}`);
export const triggerTempoPush = () =>
  request<TempoPushLog>("/tempo/push", { method: "POST" });
export const getTempoPushHistory = () =>
  request<TempoPushLog[]>("/tempo/push/history");
export const getTempoPushPending = () =>
  request<{ total: number; logs: TempoPendingLog[] }>("/tempo/push/pending");
export const skipTempoPush = (logId: number) =>
  request<{ detail: string }>(`/time-logs/${logId}/skip-tempo`, { method: "PATCH" });
export const pushLogNow = (logId: number) =>
  request<{ log_id: number; tempo_worklog_id: number; jira_issue_key: string; status: string }>(`/time-logs/${logId}/push-now`, { method: "PATCH" });

// Epics
export const getProjectEpics = (projectId: number) =>
  request<Epic[]>(`/projects/${projectId}/epics`);
export const createEpic = (projectId: number, data: { name: string; description?: string; color?: string; push_to_jira?: boolean }) =>
  request<Epic>(`/projects/${projectId}/epics`, { method: "POST", body: JSON.stringify(data) });
export const updateEpic = (projectId: number, epicId: number, data: Record<string, unknown>) =>
  request<Epic>(`/projects/${projectId}/epics/${epicId}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteEpic = (projectId: number, epicId: number) =>
  request<{ detail: string }>(`/projects/${projectId}/epics/${epicId}`, { method: "DELETE" });
export const pushEpicToJira = (projectId: number, epicId: number) =>
  request<Epic>(`/projects/${projectId}/epics/${epicId}/push-jira`, { method: "POST" });
export const getEpicTimeLogs = (epicId: number) =>
  request<TimeLog[]>(`/epics/${epicId}/time`);
export const createEpicTimeLog = (epicId: number, data: { minutes: number; logged_at: string; note?: string }) =>
  request<TimeLog>(`/epics/${epicId}/time`, { method: "POST", body: JSON.stringify(data) });
export const deleteEpicTimeLog = (epicId: number, logId: number) =>
  request<{ detail: string }>(`/epics/${epicId}/time/${logId}`, { method: "DELETE" });
export const getQuickLogEpics = (params?: { status?: string; project_id?: number; only_with_jira?: boolean }) => {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.project_id) query.set("project_id", String(params.project_id));
  if (params?.only_with_jira) query.set("only_with_jira", "true");
  const qs = query.toString();
  return request<QuickLogProject[]>(`/quick-log/epics${qs ? `?${qs}` : ""}`);
};

// Stats
export const getDashboardStats = () => request<{
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  due_today: number;
  completion_rate: number;
  avg_daily_completed: number;
  weekly: { date: string; completed: number; created: number }[];
  monthly: { month: string; completed: number; created: number }[];
  habits_overview: { id: number; name: string; color: string; completions_this_month: number; current_streak: number }[];
  total_focus_hours: number;
  focus_sessions_this_week: number;
  by_priority: Record<string, number>;
}>("/stats/dashboard");

// ─── Invitations ──────────────────────────────────────

export const getProjectInvitations = (projectId: number) =>
  request<ProjectInvitation[]>(`/projects/${projectId}/invitations/`);

export const sendProjectInvitation = (projectId: number, data: { email: string; role: string }) =>
  request<ProjectInvitation>(`/projects/${projectId}/invitations/`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const cancelProjectInvitation = (projectId: number, invitationId: number) =>
  request(`/projects/${projectId}/invitations/${invitationId}`, { method: "DELETE" });

export const getInvitationPreview = (token: string) =>
  request<ProjectInvitation>(`/invitations/${token}`);

export const acceptInvitation = (token: string, data: { area_id?: number; new_area_name?: string }) =>
  request<{ status: string; project_id: number }>(`/invitations/${token}/accept`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const declineInvitation = (token: string) =>
  request<{ status: string }>(`/invitations/${token}/decline`, { method: "POST" });

export const getMyPendingInvitations = () =>
  request<ProjectInvitation[]>("/invitations/pending/me");

// ─── Notifications ────────────────────────────────────

export const getNotifications = (limit = 50, offset = 0) =>
  request<{ total: number; unread: number; notifications: ZenoNotification[] }>(
    `/notifications/?limit=${limit}&offset=${offset}`
  );

export const getUnreadNotificationCount = () =>
  request<{ unread: number }>("/notifications/unread-count");

export const markNotificationRead = (id: number) =>
  request(`/notifications/${id}/read`, { method: "PATCH" });

export const markAllNotificationsRead = () =>
  request("/notifications/read-all", { method: "PATCH" });

export const deleteNotification = (id: number) =>
  request(`/notifications/${id}`, { method: "DELETE" });

// ─── Project Members (updated) ────────────────────────

export const updateMemberRole = (projectId: number, memberId: number, role: string) =>
  request(`/projects/${projectId}/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
