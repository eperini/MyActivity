"""
Report service — builds normalized ReportData from DB queries.
Supports both async (FastAPI) and sync (Celery) database sessions.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.task import Task, TaskStatus
from app.models.time_log import TimeLog
from app.models.user import User
from app.models.report import ReportType


# ── Data classes ────────────────────────────────────────────────────

@dataclass
class TaskSummary:
    id: int
    title: str
    status: str
    project_name: str
    completed_at: str | None  # ISO date string for JSON serialization
    logged_minutes: int
    estimated_minutes: int | None


@dataclass
class ProjectSummary:
    id: int
    name: str
    client_name: str | None
    status: str
    total_tasks: int
    done_tasks: int
    open_tasks: int
    completion_pct: float
    logged_minutes: int
    estimated_minutes: int | None
    tasks: list[TaskSummary] = field(default_factory=list)


@dataclass
class PersonSummary:
    user_id: int | None
    tempo_user_id: int | None
    display_name: str
    source: str  # "zeno" | "tempo" | "both"
    logged_minutes: int
    done_tasks: int
    projects: list[str] = field(default_factory=list)


@dataclass
class TimeLogDetail:
    logged_at: str
    project_name: str
    task_title: str
    minutes: int
    note: str | None


@dataclass
class ReportData:
    title: str
    report_type: str
    period_from: str  # ISO date
    period_to: str
    generated_at: str  # ISO datetime

    total_logged_minutes: int
    total_done_tasks: int
    total_open_tasks: int
    avg_completion_pct: float

    prev_logged_minutes: int
    prev_done_tasks: int
    trend_minutes_pct: float
    trend_tasks_pct: float

    projects: list[ProjectSummary] = field(default_factory=list)
    persons: list[PersonSummary] = field(default_factory=list)
    time_log_details: list[TimeLogDetail] = field(default_factory=list)


def report_data_to_json(data: ReportData) -> dict:
    return asdict(data)


def report_data_from_json(d: dict) -> ReportData:
    projects = [ProjectSummary(
        **{k: v for k, v in p.items() if k != "tasks"},
        tasks=[TaskSummary(**t) for t in p.get("tasks", [])]
    ) for p in d.get("projects", [])]
    persons = [PersonSummary(
        user_id=p.get("user_id"),
        tempo_user_id=p.get("tempo_user_id"),
        display_name=p["display_name"],
        source=p.get("source", "zeno"),
        logged_minutes=p["logged_minutes"],
        done_tasks=p["done_tasks"],
        projects=p.get("projects", []),
    ) for p in d.get("persons", [])]
    time_log_details = [TimeLogDetail(**t) for t in d.get("time_log_details", [])]
    return ReportData(
        title=d["title"],
        report_type=d["report_type"],
        period_from=d["period_from"],
        period_to=d["period_to"],
        generated_at=d["generated_at"],
        total_logged_minutes=d["total_logged_minutes"],
        total_done_tasks=d["total_done_tasks"],
        total_open_tasks=d["total_open_tasks"],
        avg_completion_pct=d["avg_completion_pct"],
        prev_logged_minutes=d["prev_logged_minutes"],
        prev_done_tasks=d["prev_done_tasks"],
        trend_minutes_pct=d["trend_minutes_pct"],
        trend_tasks_pct=d["trend_tasks_pct"],
        projects=projects,
        persons=persons,
        time_log_details=time_log_details,
    )


def _calc_trend(current: int, previous: int) -> float:
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return ((current - previous) / previous) * 100


def _default_title(report_type: str, period_from: date, period_to: date) -> str:
    month = period_from.strftime("%B %Y")
    if report_type == "person":
        return f"Report Personale — {month}"
    elif report_type == "project":
        return f"Report Progetto — {month}"
    return f"Report Cliente — {month}"


# ── Async service (for FastAPI endpoints) ───────────────────────────

class AsyncReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def build_report_data(
        self,
        report_type: str,
        period_from: date,
        period_to: date,
        target_user_id: int | None = None,
        target_project_id: int | None = None,
        target_client_name: str | None = None,
        title: str | None = None,
    ) -> ReportData:
        delta = (period_to - period_from).days
        prev_to = period_from - timedelta(days=1)
        prev_from = prev_to - timedelta(days=delta)

        projects = await self._get_projects_in_scope(
            report_type, target_user_id, target_project_id, target_client_name
        )
        project_ids = [p.id for p in projects]

        if not project_ids:
            return ReportData(
                title=title or _default_title(report_type, period_from, period_to),
                report_type=report_type,
                period_from=period_from.isoformat(),
                period_to=period_to.isoformat(),
                generated_at=datetime.now(timezone.utc).isoformat(),
                total_logged_minutes=0, total_done_tasks=0, total_open_tasks=0,
                avg_completion_pct=0.0, prev_logged_minutes=0, prev_done_tasks=0,
                trend_minutes_pct=0.0, trend_tasks_pct=0.0,
            )

        # Fetch tasks for projects
        tasks = await self._get_tasks(project_ids)

        # Time logs current + previous period
        logs_current = await self._get_time_logs(project_ids, period_from, period_to, target_user_id)
        logs_prev = await self._get_time_logs(project_ids, prev_from, prev_to, target_user_id)

        # Time log details for Excel
        time_details = await self._get_time_log_details(project_ids, period_from, period_to, target_user_id)

        # Build per-project summaries
        project_map: dict[int, Project] = {p.id: p for p in projects}
        task_by_project: dict[int, list[Task]] = {}
        for t in tasks:
            if t.project_id:
                task_by_project.setdefault(t.project_id, []).append(t)

        log_minutes_by_task: dict[int, int] = {}
        for log in logs_current:
            log_minutes_by_task[log.task_id] = log_minutes_by_task.get(log.task_id, 0) + log.minutes

        project_summaries = []
        total_done = 0
        total_open = 0
        total_minutes = sum(l.minutes for l in logs_current)
        prev_minutes = sum(l.minutes for l in logs_prev)

        for pid, proj in project_map.items():
            ptasks = task_by_project.get(pid, [])
            done = [t for t in ptasks if t.status == TaskStatus.DONE]
            opened = [t for t in ptasks if t.status != TaskStatus.DONE]
            total_done += len(done)
            total_open += len(opened)

            est = sum(t.estimated_minutes or 0 for t in ptasks if t.estimated_minutes)
            proj_minutes = sum(log_minutes_by_task.get(t.id, 0) for t in ptasks)

            pct = (len(done) / len(ptasks) * 100) if ptasks else 0.0

            task_summaries = []
            for t in ptasks:
                task_summaries.append(TaskSummary(
                    id=t.id,
                    title=t.title,
                    status=t.status.value,
                    project_name=proj.name,
                    completed_at=t.completed_at.date().isoformat() if t.completed_at else None,
                    logged_minutes=log_minutes_by_task.get(t.id, 0),
                    estimated_minutes=t.estimated_minutes,
                ))

            project_summaries.append(ProjectSummary(
                id=pid,
                name=proj.name,
                client_name=proj.client_name,
                status=proj.status.value if hasattr(proj.status, 'value') else str(proj.status),
                total_tasks=len(ptasks),
                done_tasks=len(done),
                open_tasks=len(opened),
                completion_pct=round(pct, 1),
                logged_minutes=proj_minutes,
                estimated_minutes=est or None,
                tasks=task_summaries,
            ))

        # Count done tasks in previous period
        prev_done = await self._count_done_tasks(project_ids, prev_from, prev_to)

        # Persons summary (for project/client reports)
        persons = []
        if report_type in ("project", "client"):
            persons = await self._get_persons_summary(project_ids, period_from, period_to, project_map)

        avg_pct = (sum(p.completion_pct for p in project_summaries) / len(project_summaries)) if project_summaries else 0.0

        return ReportData(
            title=title or _default_title(report_type, period_from, period_to),
            report_type=report_type,
            period_from=period_from.isoformat(),
            period_to=period_to.isoformat(),
            generated_at=datetime.now(timezone.utc).isoformat(),
            total_logged_minutes=total_minutes,
            total_done_tasks=total_done,
            total_open_tasks=total_open,
            avg_completion_pct=round(avg_pct, 1),
            prev_logged_minutes=prev_minutes,
            prev_done_tasks=prev_done,
            trend_minutes_pct=round(_calc_trend(total_minutes, prev_minutes), 1),
            trend_tasks_pct=round(_calc_trend(total_done, prev_done), 1),
            projects=project_summaries,
            persons=persons,
            time_log_details=time_details,
        )

    async def _get_projects_in_scope(self, report_type, user_id, project_id, client_name):
        q = select(Project).where(Project.status != "archived")
        if report_type == "project":
            q = q.where(Project.id == project_id)
        elif report_type == "client":
            q = q.where(func.lower(func.trim(Project.client_name)) == func.lower(func.trim(client_name)))
        elif report_type == "person":
            subq = (
                select(Task.project_id)
                .join(TimeLog, TimeLog.task_id == Task.id)
                .where(TimeLog.user_id == user_id)
                .distinct()
                .scalar_subquery()
            )
            q = q.where(Project.id.in_(subq))
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def _get_tasks(self, project_ids):
        result = await self.db.execute(
            select(Task).where(
                Task.project_id.in_(project_ids),
                Task.parent_id.is_(None),
            )
        )
        return list(result.scalars().all())

    async def _get_time_logs(self, project_ids, date_from, date_to, user_id=None):
        q = (
            select(TimeLog)
            .join(Task, TimeLog.task_id == Task.id)
            .where(
                Task.project_id.in_(project_ids),
                TimeLog.logged_at >= date_from,
                TimeLog.logged_at <= date_to,
            )
        )
        if user_id:
            q = q.where(TimeLog.user_id == user_id)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def _get_time_log_details(self, project_ids, date_from, date_to, user_id=None):
        q = (
            select(TimeLog, Task.title, Project.name)
            .join(Task, TimeLog.task_id == Task.id)
            .join(Project, Task.project_id == Project.id)
            .where(
                Task.project_id.in_(project_ids),
                TimeLog.logged_at >= date_from,
                TimeLog.logged_at <= date_to,
            )
            .order_by(TimeLog.logged_at.desc())
        )
        if user_id:
            q = q.where(TimeLog.user_id == user_id)
        result = await self.db.execute(q)
        details = []
        for log, task_title, proj_name in result.all():
            details.append(TimeLogDetail(
                logged_at=log.logged_at.isoformat(),
                project_name=proj_name,
                task_title=task_title,
                minutes=log.minutes,
                note=log.note,
            ))
        return details

    async def _count_done_tasks(self, project_ids, date_from, date_to):
        result = await self.db.execute(
            select(func.count()).select_from(Task).where(
                Task.project_id.in_(project_ids),
                Task.status == TaskStatus.DONE,
                Task.completed_at >= datetime.combine(date_from, datetime.min.time()),
                Task.completed_at <= datetime.combine(date_to, datetime.max.time()),
            )
        )
        return result.scalar() or 0

    async def _get_persons_summary(self, project_ids, date_from, date_to, project_map):
        from app.models.tempo import TempoUser

        # Zeno users with logged time
        result = await self.db.execute(
            select(
                TimeLog.user_id,
                User.display_name,
                func.sum(TimeLog.minutes).label("total_minutes"),
            )
            .join(Task, TimeLog.task_id == Task.id)
            .join(User, TimeLog.user_id == User.id)
            .where(
                Task.project_id.in_(project_ids),
                TimeLog.logged_at >= date_from,
                TimeLog.logged_at <= date_to,
                TimeLog.user_id.isnot(None),
            )
            .group_by(TimeLog.user_id, User.display_name)
        )
        persons = []
        for uid, name, minutes in result.all():
            done_result = await self.db.execute(
                select(func.count()).select_from(Task).where(
                    Task.project_id.in_(project_ids),
                    Task.assigned_to == uid,
                    Task.status == TaskStatus.DONE,
                )
            )
            done_count = done_result.scalar() or 0

            proj_result = await self.db.execute(
                select(Project.name).distinct()
                .join(Task, Task.project_id == Project.id)
                .join(TimeLog, TimeLog.task_id == Task.id)
                .where(
                    Task.project_id.in_(project_ids),
                    TimeLog.user_id == uid,
                    TimeLog.logged_at >= date_from,
                    TimeLog.logged_at <= date_to,
                )
            )
            proj_names = [r[0] for r in proj_result.all()]

            persons.append(PersonSummary(
                user_id=uid,
                tempo_user_id=None,
                display_name=name,
                source="zeno",
                logged_minutes=minutes or 0,
                done_tasks=done_count,
                projects=proj_names,
            ))

        # Tempo ghost users with logged time
        tempo_result = await self.db.execute(
            select(
                TimeLog.tempo_user_id,
                TempoUser.display_name,
                func.sum(TimeLog.minutes).label("total_minutes"),
            )
            .join(Task, TimeLog.task_id == Task.id)
            .join(TempoUser, TimeLog.tempo_user_id == TempoUser.id)
            .where(
                Task.project_id.in_(project_ids),
                TimeLog.logged_at >= date_from,
                TimeLog.logged_at <= date_to,
                TimeLog.tempo_user_id.isnot(None),
                TimeLog.user_id.is_(None),
            )
            .group_by(TimeLog.tempo_user_id, TempoUser.display_name)
        )
        for tuid, name, minutes in tempo_result.all():
            proj_result = await self.db.execute(
                select(Project.name).distinct()
                .join(Task, Task.project_id == Project.id)
                .join(TimeLog, TimeLog.task_id == Task.id)
                .where(
                    Task.project_id.in_(project_ids),
                    TimeLog.tempo_user_id == tuid,
                    TimeLog.logged_at >= date_from,
                    TimeLog.logged_at <= date_to,
                )
            )
            proj_names = [r[0] for r in proj_result.all()]

            persons.append(PersonSummary(
                user_id=None,
                tempo_user_id=tuid,
                display_name=name,
                source="tempo",
                logged_minutes=minutes or 0,
                done_tasks=0,
                projects=proj_names,
            ))

        return sorted(persons, key=lambda p: p.logged_minutes, reverse=True)


# ── Sync service (for Celery workers) ──────────────────────────────

class SyncReportService:
    def __init__(self, db: Session):
        self.db = db

    def build_report_data(
        self,
        report_type: str,
        period_from: date,
        period_to: date,
        target_user_id: int | None = None,
        target_project_id: int | None = None,
        target_client_name: str | None = None,
        title: str | None = None,
    ) -> ReportData:
        delta = (period_to - period_from).days
        prev_to = period_from - timedelta(days=1)
        prev_from = prev_to - timedelta(days=delta)

        projects = self._get_projects_in_scope(
            report_type, target_user_id, target_project_id, target_client_name
        )
        project_ids = [p.id for p in projects]

        if not project_ids:
            return ReportData(
                title=title or _default_title(report_type, period_from, period_to),
                report_type=report_type,
                period_from=period_from.isoformat(),
                period_to=period_to.isoformat(),
                generated_at=datetime.now(timezone.utc).isoformat(),
                total_logged_minutes=0, total_done_tasks=0, total_open_tasks=0,
                avg_completion_pct=0.0, prev_logged_minutes=0, prev_done_tasks=0,
                trend_minutes_pct=0.0, trend_tasks_pct=0.0,
            )

        tasks = self.db.query(Task).filter(
            Task.project_id.in_(project_ids), Task.parent_id.is_(None)
        ).all()

        logs_current = self._get_time_logs(project_ids, period_from, period_to, target_user_id)
        logs_prev = self._get_time_logs(project_ids, prev_from, prev_to, target_user_id)

        project_map = {p.id: p for p in projects}
        task_by_project: dict[int, list] = {}
        for t in tasks:
            if t.project_id:
                task_by_project.setdefault(t.project_id, []).append(t)

        log_minutes_by_task: dict[int, int] = {}
        for log in logs_current:
            log_minutes_by_task[log.task_id] = log_minutes_by_task.get(log.task_id, 0) + log.minutes

        project_summaries = []
        total_done = 0
        total_open = 0
        total_minutes = sum(l.minutes for l in logs_current)
        prev_minutes = sum(l.minutes for l in logs_prev)

        for pid, proj in project_map.items():
            ptasks = task_by_project.get(pid, [])
            done = [t for t in ptasks if t.status == TaskStatus.DONE]
            opened = [t for t in ptasks if t.status != TaskStatus.DONE]
            total_done += len(done)
            total_open += len(opened)

            est = sum(t.estimated_minutes or 0 for t in ptasks if t.estimated_minutes)
            proj_minutes = sum(log_minutes_by_task.get(t.id, 0) for t in ptasks)
            pct = (len(done) / len(ptasks) * 100) if ptasks else 0.0

            task_summaries = [TaskSummary(
                id=t.id, title=t.title, status=t.status.value,
                project_name=proj.name,
                completed_at=t.completed_at.date().isoformat() if t.completed_at else None,
                logged_minutes=log_minutes_by_task.get(t.id, 0),
                estimated_minutes=t.estimated_minutes,
            ) for t in ptasks]

            project_summaries.append(ProjectSummary(
                id=pid, name=proj.name, client_name=proj.client_name,
                status=proj.status.value if hasattr(proj.status, 'value') else str(proj.status),
                total_tasks=len(ptasks), done_tasks=len(done), open_tasks=len(opened),
                completion_pct=round(pct, 1), logged_minutes=proj_minutes,
                estimated_minutes=est or None, tasks=task_summaries,
            ))

        prev_done = self.db.query(func.count()).select_from(Task).filter(
            Task.project_id.in_(project_ids),
            Task.status == TaskStatus.DONE,
            Task.completed_at >= datetime.combine(period_from - timedelta(days=delta + 1), datetime.min.time()),
            Task.completed_at <= datetime.combine(prev_to, datetime.max.time()),
        ).scalar() or 0

        avg_pct = (sum(p.completion_pct for p in project_summaries) / len(project_summaries)) if project_summaries else 0.0

        return ReportData(
            title=title or _default_title(report_type, period_from, period_to),
            report_type=report_type,
            period_from=period_from.isoformat(),
            period_to=period_to.isoformat(),
            generated_at=datetime.now(timezone.utc).isoformat(),
            total_logged_minutes=total_minutes,
            total_done_tasks=total_done,
            total_open_tasks=total_open,
            avg_completion_pct=round(avg_pct, 1),
            prev_logged_minutes=prev_minutes,
            prev_done_tasks=prev_done,
            trend_minutes_pct=round(_calc_trend(total_minutes, prev_minutes), 1),
            trend_tasks_pct=round(_calc_trend(total_done, prev_done), 1),
            projects=project_summaries,
        )

    def _get_projects_in_scope(self, report_type, user_id, project_id, client_name):
        q = self.db.query(Project).filter(Project.status != "archived")
        if report_type == "project":
            q = q.filter(Project.id == project_id)
        elif report_type == "client":
            q = q.filter(func.lower(func.trim(Project.client_name)) == func.lower(func.trim(client_name)))
        elif report_type == "person":
            subq = self.db.query(Task.project_id).join(TimeLog).filter(
                TimeLog.user_id == user_id
            ).distinct().subquery()
            q = q.filter(Project.id.in_(subq))
        return q.all()

    def _get_time_logs(self, project_ids, date_from, date_to, user_id=None):
        q = self.db.query(TimeLog).join(Task).filter(
            Task.project_id.in_(project_ids),
            TimeLog.logged_at >= date_from,
            TimeLog.logged_at <= date_to,
        )
        if user_id:
            q = q.filter(TimeLog.user_id == user_id)
        return q.all()
