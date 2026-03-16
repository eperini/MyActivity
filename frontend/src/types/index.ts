export interface User {
  id: number;
  email: string;
  display_name: string;
  telegram_chat_id: number | null;
  is_admin: boolean;
}

export type TaskStatus = "todo" | "doing" | "done" | "someday";

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
  created_by: number;
  assigned_to: number | null;
  assigned_to_name?: string | null;
  priority: number;
  status: TaskStatus;
  due_date: string | null;
  due_time: string | null;
  start_date: string | null;
  project_id: number | null;
  heading_id: number | null;
  custom_fields?: Record<string, unknown>;
  parent_id: number | null;
  has_recurrence?: boolean;
  next_occurrence?: string | null;
  tags?: Tag[];
  subtask_count?: number;
  subtask_done_count?: number;
  estimated_minutes?: number | null;
  time_only?: boolean;
  time_logged_minutes?: number;
  time_logged_formatted?: string;
  position?: number;
  jira_issue_key?: string | null;
  jira_url?: string | null;
}

export interface TimeLog {
  id: number;
  task_id: number | null;
  epic_id?: number;
  user_id: number | null;
  user_name: string;
  logged_at: string;
  minutes: number;
  formatted: string;
  note: string | null;
  source?: string;
  tempo_push_status?: string | null;
  tempo_push_error?: string | null;
  jira_issue_key?: string | null;
  created_at: string;
}

export interface TempoPushLog {
  id: number;
  triggered_by: number | null;
  status: string;
  logs_found: number;
  logs_pushed: number;
  logs_updated: number;
  logs_deleted: number;
  logs_skipped: number;
  logs_error: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface TempoPendingLog {
  log_id: number;
  task_id: number;
  task_title: string;
  jira_issue_key: string | null;
  logged_at: string;
  minutes: number;
  status: string;
  error: string | null;
  has_jira: boolean;
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
  show_undated_eisenhower: boolean;
  drive_links: { name: string; url: string }[] | null;
  task_count: number;
  completed_count: number;
  is_shared?: boolean;
  current_user_role?: ProjectRole | null;
}

export interface ProjectHeading {
  id: number;
  project_id: number;
  name: string;
  position: number;
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

// Reports
export type ReportType = 'person' | 'project' | 'client';
export type ReportFrequency = 'weekly' | 'monthly';

export interface ReportHistoryItem {
  id: number;
  report_type: ReportType;
  title: string | null;
  period_from: string;
  period_to: string;
  generated_at: string;
  status: string;
  has_pdf: boolean;
  has_excel: boolean;
  summary: {
    total_logged_minutes: number;
    total_done_tasks: number;
    total_open_tasks: number;
    avg_completion_pct: number;
  } | null;
}

export interface ReportConfigItem {
  id: number;
  name: string;
  report_type: ReportType;
  frequency: ReportFrequency;
  target_user_id: number | null;
  target_project_id: number | null;
  target_client_name: string | null;
  is_active: boolean;
  send_email: boolean;
  email_to: string | null;
  last_sent_at: string | null;
  created_at: string;
}

export interface ReportGenerateResult {
  history_id: number;
  title: string;
  generated_at: string;
  downloads: {
    pdf: string | null;
    excel: string | null;
  };
  summary: {
    total_logged_minutes: number;
    total_done_tasks: number;
    total_open_tasks: number;
    avg_completion_pct: number;
  };
}

// Tempo
export interface TempoUser {
  id: number;
  tempo_account_id: string;
  display_name: string;
  email: string | null;
  zeno_user_id: number | null;
  is_active: boolean;
  total_logs: number;
  total_minutes: number;
  total_formatted: string;
}

export interface TempoImportLog {
  id: number;
  triggered_by: number | null;
  period_from: string;
  period_to: string;
  status: string;
  worklogs_found: number;
  worklogs_created: number;
  worklogs_updated: number;
  worklogs_skipped: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface TempoConfig {
  is_configured: boolean;
  sync_interval_days: number;
  last_auto_sync_at: string | null;
  last_auto_sync_status: string | null;
  total_tempo_users: number;
  total_imported_logs: number;
}

// Epics
export type EpicStatus = 'todo' | 'in_progress' | 'done';

export interface Epic {
  id: number;
  project_id: number;
  name: string;
  description?: string;
  status: EpicStatus;
  color?: string;
  start_date?: string;
  target_date?: string;
  completed_at?: string;
  jira_issue_key?: string;
  jira_url?: string;
  jira_synced_at?: string;
  position: number;
  total_logged_minutes: number;
  total_logged_formatted: string;
  last_log_date?: string;
  created_at: string;
  updated_at: string;
}

export interface QuickLogProject {
  project_id: number;
  project_name: string;
  jira_key: string;
  epics: Epic[];
}

// Sharing & Notifications
export type ProjectRole = 'admin' | 'super_user' | 'user';

export type NotificationType =
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_commented'
  | 'task_due_soon'
  | 'project_invitation'
  | 'sprint_started'
  | 'sprint_completed'
  | 'mention'
  | 'automation_triggered'
  | 'tempo_sync_error'
  | 'report_ready';

export type InvitationStatus =
  | 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export interface ProjectInvitation {
  id: number;
  project_id: number;
  email: string;
  role: string;
  status: InvitationStatus;
  expires_at: string;
  invited_by_name: string;
  project_name?: string;
  created_at: string;
}

export interface ZenoNotification {
  id: number;
  type: NotificationType;
  title: string;
  body?: string;
  is_read: boolean;
  project_id?: number;
  task_id?: number;
  epic_id?: number;
  created_at: string;
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
