export interface User {
  id: number;
  email: string;
  display_name: string;
  telegram_chat_id: number | null;
  is_admin: boolean;
}

export interface TaskList {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  owner_id: number;
}

export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: number;
  title: string;
  description: string | null;
  list_id: number;
  created_by: number;
  assigned_to: number | null;
  priority: number;
  status: TaskStatus;
  due_date: string | null;
  due_time: string | null;
  parent_id: number | null;
  has_recurrence?: boolean;
}

export interface RecurrenceRule {
  id: number;
  task_id: number;
  rrule: string;
  workday_adjust: "none" | "next" | "prev";
  workday_target: number | null;
  next_occurrence: string | null;
}

export interface TaskInstance {
  id: number;
  task_id: number;
  due_date: string;
  status: string;
  completed_at: string | null;
}

export interface Habit {
  id: number;
  name: string;
  description: string | null;
  frequency_type: string;
  frequency_days: number[];
  times_per_period: number;
  start_date: string;
  color: string;
  is_archived: boolean;
}

export interface HabitLog {
  id: number;
  habit_id: number;
  log_date: string;
  value: number;
  note: string | null;
}

export interface HabitStats {
  total_completions: number;
  current_streak: number;
  monthly_checkins: number;
  monthly_rate: number;
}

export interface PomodoroSession {
  id: number;
  user_id: number;
  task_id: number | null;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  session_type: string;
}

export interface PomodoroStats {
  today_pomos: number;
  today_focus_minutes: number;
  total_pomos: number;
  total_focus_minutes: number;
}
