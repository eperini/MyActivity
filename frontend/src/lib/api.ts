import type { Task, TaskList, Habit, HabitLog, HabitStats, RecurrenceRule, TaskInstance, PomodoroSession, PomodoroStats, ListMember, Tag, TaskComment, TaskTemplate } from "@/types";

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
