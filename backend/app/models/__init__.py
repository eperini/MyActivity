# Import all models so SQLAlchemy relationships resolve correctly
from app.models.user import User
from app.models.task_list import TaskList, ListMember
from app.models.task import Task
from app.models.recurrence import RecurrenceRule, TaskInstance
from app.models.notification import Notification
from app.models.habit import Habit, HabitLog
from app.models.pomodoro import PomodoroSession
from app.models.push_subscription import PushSubscription
from app.models.tag import Tag, task_tags
from app.models.comment import Comment
from app.models.template import TaskTemplate
from app.models.area import Area
from app.models.project import Project, ProjectMember
from app.models.custom_field import ProjectCustomField, FieldType
from app.models.dependency import TaskDependency, DependencyType
from app.models.automation import AutomationRule, TriggerType, ActionType
from app.models.sprint import Sprint, SprintStatus, sprint_tasks
from app.models.time_log import TimeLog, TimeLogDeleted
from app.models.jira import JiraConfig
from app.models.report import ReportConfig, ReportHistory, ReportType, ReportFrequency
from app.models.tempo import TempoUser, TempoImportLog, TempoPushLog

__all__ = [
    "User", "TaskList", "ListMember", "Task",
    "RecurrenceRule", "TaskInstance", "Notification",
    "Habit", "HabitLog", "PomodoroSession", "PushSubscription",
    "Tag", "task_tags", "Comment", "TaskTemplate",
    "Area", "Project", "ProjectMember",
    "ProjectCustomField", "FieldType",
    "TaskDependency", "DependencyType",
    "AutomationRule", "TriggerType", "ActionType",
    "Sprint", "SprintStatus", "sprint_tasks",
    "TimeLog", "TimeLogDeleted",
    "JiraConfig",
    "ReportConfig", "ReportHistory", "ReportType", "ReportFrequency",
    "TempoUser", "TempoImportLog", "TempoPushLog",
]
