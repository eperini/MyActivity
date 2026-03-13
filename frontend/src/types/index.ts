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

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  text: string;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  list_id: number;
  created_by: number;
  assigned_to: number | null;
  assigned_to_name?: string | null;
  priority: number;
  status: TaskStatus;
  due_date: string | null;
  due_time: string | null;
  project_id: number | null;
  custom_fields?: Record<string, unknown>;
  parent_id: number | null;
  has_recurrence?: boolean;
  next_occurrence?: string | null;
  tags?: Tag[];
  subtask_count?: number;
  subtask_done_count?: number;
  estimated_minutes?: number | null;
  time_logged_minutes?: number;
  time_logged_formatted?: string;
  jira_issue_key?: string | null;
  jira_url?: string | null;
}

export interface TimeLog {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  logged_at: string;
  minutes: number;
  formatted: string;
  note: string | null;
  created_at: string;
}

export interface WeeklyTimeData {
  week_start: string;
  week_end: string;
  total_minutes: number;
  total_formatted: string;
  by_project: {
    project_id: number | null;
    project_name: string;
    minutes: number;
    formatted: string;
    logs: {
      task_id: number;
      task_title: string;
      minutes: number;
      logged_at: string;
      note: string | null;
    }[];
  }[];
  by_day: {
    date: string;
    minutes: number;
    formatted: string;
  }[];
}

export interface TaskTemplate {
  id: number;
  name: string;
  title: string;
  description: string | null;
  priority: number;
  subtask_titles: string[] | null;
  recurrence_config: Record<string, unknown> | null;
  created_at: string;
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

export interface ListMember {
  id: number;
  user_id: number;
  email: string;
  display_name: string;
  role: string;
}

// Custom Fields
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'boolean' | 'url';

export interface ProjectCustomField {
  id: number;
  project_id: number;
  name: string;
  field_key: string;
  field_type: FieldType;
  options?: string[];
  default_value?: unknown;
  is_required: boolean;
  position: number;
}

// Areas & Projects (v2)
export type ProjectType = "technical" | "administrative" | "personal";
export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";

export interface Area {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  position: number;
  project_count: number;
}

export interface Project {
  id: number;
  area_id: number | null;
  name: string;
  description: string | null;
  project_type: ProjectType;
  status: ProjectStatus;
  color: string | null;
  icon: string | null;
  owner_id: number;
  start_date: string | null;
  target_date: string | null;
  client_name: string | null;
  position: number;
  task_count: number;
  completed_count: number;
}

export interface ProjectMember {
  id: number;
  user_id: number;
  email: string;
  display_name: string;
  role: string;
}

export interface ProjectStats {
  total_tasks: number;
  completed_tasks: number;
  completion_pct: number;
  overdue_tasks: number;
  by_priority: Record<string, number>;
}

// Task Dependencies
export type DependencyType = 'blocks' | 'relates_to' | 'duplicates';

export interface TaskDependencyItem {
  id: number;
  task_id: number;
  title: string;
  status: string;
  dependency_type: DependencyType;
}

export interface TaskDependencies {
  blocking: TaskDependencyItem[];
  blocked_by: TaskDependencyItem[];
  relates_to: TaskDependencyItem[];
}

// Sprints
export type SprintStatus = 'planned' | 'active' | 'completed';

export interface Sprint {
  id: number;
  project_id: number;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: SprintStatus;
  task_count: number;
  completed_count: number;
}

export interface SprintDetail {
  sprint: Sprint;
  tasks: Task[];
  metrics: {
    total_tasks: number;
    completed_tasks: number;
    completion_pct: number;
    days_remaining: number;
  };
}

// Automation Rules
export type TriggerType = 'status_changed' | 'due_date_passed' | 'task_created' | 'all_subtasks_done' | 'assigned_to_changed';
export type ActionType = 'change_status' | 'assign_to' | 'create_task' | 'send_notification' | 'set_field';

// Jira Sync
export interface JiraConfig {
  id: number;
  jira_project_key: string;
  zeno_project_id: number;
  zeno_project_name: string | null;
  default_list_id: number | null;
  default_list_name: string | null;
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  task_count_synced: number;
}

export interface JiraProject {
  key: string;
  name: string;
}

export interface AutomationRule {
  id: number;
  project_id: number;
  name: string;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  action_type: ActionType;
  action_config: Record<string, unknown>;
  created_at: string;
  last_triggered: string | null;
}
