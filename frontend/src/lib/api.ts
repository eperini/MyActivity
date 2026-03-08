import type { Task, TaskList, Habit, HabitLog, HabitStats, RecurrenceRule, TaskInstance, PomodoroSession, PomodoroStats, ListMember } from "@/types";

function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === "undefined") return "http://localhost:8000/api";
  // Use same hostname as browser (works with localhost and Tailscale IP)
  return `http://${window.location.hostname}:8000/api`;
}
const API_URL = getApiUrl();

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    if (window.location.pathname !== "/login") {
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
  const data = await request<{ access_token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("token", data.access_token);
  return data;
}

export async function register(email: string, password: string, display_name: string) {
  const data = await request<{ access_token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, display_name }),
  });
  localStorage.setItem("token", data.access_token);
  return data;
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

// Import
export async function importTasks(file: File): Promise<{ tasks_imported: number; errors: string[] }> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/export/import/tasks`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
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
