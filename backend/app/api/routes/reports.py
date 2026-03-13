"""Report generation and history API endpoints."""
from datetime import date, datetime, timezone
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.report import (
    ReportConfig, ReportHistory, ReportType, ReportFrequency,
)
from app.services.report_service import (
    AsyncReportService, report_data_to_json, report_data_from_json,
)
from app.services.pdf_generator import PDFGenerator
from app.services.excel_generator import ExcelGenerator

router = APIRouter()

REPORTS_DIR = "/tmp/zeno_reports"
os.makedirs(REPORTS_DIR, exist_ok=True)


# ── Schemas ──────────────────────────────────────────────────────────

class ReportGenerateRequest(BaseModel):
    report_type: ReportType
    period_from: date
    period_to: date
    target_user_id: int | None = None
    target_project_id: int | None = None
    target_client_name: str | None = None
    title: str | None = None
    formats: list[str] = Field(default=["pdf", "excel"])

    @model_validator(mode="after")
    def validate_target(self):
        # target_user_id is optional for person: defaults to current user in the endpoint
        if self.report_type == ReportType.project and not self.target_project_id:
            raise ValueError("target_project_id richiesto per report tipo 'project'")
        if self.report_type == ReportType.client and not self.target_client_name:
            raise ValueError("target_client_name richiesto per report tipo 'client'")
        return self


class ReportHistoryOut(BaseModel):
    id: int
    report_type: str
    title: str | None
    period_from: str
    period_to: str
    generated_at: str
    status: str
    has_pdf: bool
    has_excel: bool
    summary: dict | None = None


class ReportConfigCreate(BaseModel):
    name: str
    report_type: ReportType
    frequency: ReportFrequency
    target_user_id: int | None = None
    target_project_id: int | None = None
    target_client_name: str | None = None
    send_email: bool = True
    email_to: str | None = None


class ReportConfigOut(BaseModel):
    id: int
    name: str
    report_type: str
    frequency: str
    target_user_id: int | None
    target_project_id: int | None
    target_client_name: str | None
    is_active: bool
    send_email: bool
    email_to: str | None
    last_sent_at: str | None
    created_at: str


class ReportConfigUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    send_email: bool | None = None
    email_to: str | None = None


# ── Generate ─────────────────────────────────────────────────────────

@router.post("/reports/generate")
async def generate_report(
    req: ReportGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = AsyncReportService(db)
    # For person reports, default to current user
    target_user = req.target_user_id or (user.id if req.report_type == ReportType.person else None)
    data = await svc.build_report_data(
        report_type=req.report_type.value,
        period_from=req.period_from,
        period_to=req.period_to,
        target_user_id=target_user,
        target_project_id=req.target_project_id,
        target_client_name=req.target_client_name,
        title=req.title,
    )

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    base_name = f"report_{user.id}_{ts}"
    pdf_path = None
    excel_path = None

    if "pdf" in req.formats:
        pdf_path = os.path.join(REPORTS_DIR, f"{base_name}.pdf")
        PDFGenerator().generate(data, pdf_path)

    if "excel" in req.formats:
        excel_path = os.path.join(REPORTS_DIR, f"{base_name}.xlsx")
        ExcelGenerator().generate(data, excel_path)

    history = ReportHistory(
        user_id=user.id,
        report_type=req.report_type,
        title=data.title,
        period_from=req.period_from,
        period_to=req.period_to,
        file_path=pdf_path,
        excel_path=excel_path,
        data_json=report_data_to_json(data),
        status="ok",
    )
    db.add(history)
    await db.commit()
    await db.refresh(history)

    return {
        "history_id": history.id,
        "title": data.title,
        "generated_at": data.generated_at,
        "downloads": {
            "pdf": f"/api/reports/history/{history.id}/download/pdf" if pdf_path else None,
            "excel": f"/api/reports/history/{history.id}/download/excel" if excel_path else None,
        },
        "summary": {
            "total_logged_minutes": data.total_logged_minutes,
            "total_done_tasks": data.total_done_tasks,
            "total_open_tasks": data.total_open_tasks,
            "avg_completion_pct": data.avg_completion_pct,
        },
    }


# ── History ──────────────────────────────────────────────────────────

@router.get("/reports/history", response_model=list[ReportHistoryOut])
async def get_report_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ReportHistory)
        .where(ReportHistory.user_id == user.id)
        .order_by(ReportHistory.generated_at.desc())
        .limit(50)
    )
    rows = result.scalars().all()
    out = []
    for h in rows:
        summary = None
        if h.data_json:
            summary = {
                "total_logged_minutes": h.data_json.get("total_logged_minutes", 0),
                "total_done_tasks": h.data_json.get("total_done_tasks", 0),
                "total_open_tasks": h.data_json.get("total_open_tasks", 0),
                "avg_completion_pct": h.data_json.get("avg_completion_pct", 0),
            }
        out.append(ReportHistoryOut(
            id=h.id,
            report_type=h.report_type.value if hasattr(h.report_type, 'value') else h.report_type,
            title=h.title,
            period_from=h.period_from.isoformat() if h.period_from else "",
            period_to=h.period_to.isoformat() if h.period_to else "",
            generated_at=h.generated_at.isoformat() if h.generated_at else "",
            status=h.status,
            has_pdf=bool(h.file_path and os.path.exists(h.file_path)),
            has_excel=bool(h.excel_path and os.path.exists(h.excel_path)),
            summary=summary,
        ))
    return out


@router.get("/reports/history/{history_id}/download/pdf")
async def download_report_pdf(
    history_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    h = await db.get(ReportHistory, history_id)
    if not h or h.user_id != user.id:
        raise HTTPException(status_code=404, detail="Report non trovato")
    if not h.file_path or not os.path.exists(h.file_path):
        raise HTTPException(status_code=404, detail="File PDF non disponibile")
    filename = f"{h.title or 'report'}.pdf"
    return FileResponse(h.file_path, media_type="application/pdf", filename=filename)


@router.get("/reports/history/{history_id}/download/excel")
async def download_report_excel(
    history_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    h = await db.get(ReportHistory, history_id)
    if not h or h.user_id != user.id:
        raise HTTPException(status_code=404, detail="Report non trovato")
    if not h.excel_path or not os.path.exists(h.excel_path):
        # Regenerate from data_json if available
        if h.data_json:
            data = report_data_from_json(h.data_json)
            excel_path = os.path.join(REPORTS_DIR, f"report_{h.id}_regen.xlsx")
            ExcelGenerator().generate(data, excel_path)
            h.excel_path = excel_path
            await db.commit()
            return FileResponse(excel_path,
                                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                filename=f"{h.title or 'report'}.xlsx")
        raise HTTPException(status_code=404, detail="File Excel non disponibile")
    filename = f"{h.title or 'report'}.xlsx"
    return FileResponse(h.excel_path,
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        filename=filename)


@router.delete("/reports/history/{history_id}")
async def delete_report_history(
    history_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    h = await db.get(ReportHistory, history_id)
    if not h or h.user_id != user.id:
        raise HTTPException(status_code=404, detail="Report non trovato")
    # Remove files
    for path in [h.file_path, h.excel_path]:
        if path and os.path.exists(path):
            os.remove(path)
    await db.delete(h)
    await db.commit()
    return {"detail": "Report eliminato"}


# ── Clients list ─────────────────────────────────────────────────────

@router.get("/reports/clients")
async def get_report_clients(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(func.distinct(Project.client_name))
        .where(
            Project.owner_id == user.id,
            Project.client_name.isnot(None),
            Project.client_name != "",
        )
        .order_by(Project.client_name)
    )
    return [r[0] for r in result.all()]


# ── Config CRUD ──────────────────────────────────────────────────────

@router.get("/reports/configs", response_model=list[ReportConfigOut])
async def get_report_configs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ReportConfig).where(ReportConfig.user_id == user.id)
    )
    configs = result.scalars().all()
    return [ReportConfigOut(
        id=c.id,
        name=c.name,
        report_type=c.report_type.value,
        frequency=c.frequency.value,
        target_user_id=c.target_user_id,
        target_project_id=c.target_project_id,
        target_client_name=c.target_client_name,
        is_active=c.is_active,
        send_email=c.send_email,
        email_to=c.email_to,
        last_sent_at=c.last_sent_at.isoformat() if c.last_sent_at else None,
        created_at=c.created_at.isoformat() if c.created_at else "",
    ) for c in configs]


@router.post("/reports/configs", response_model=ReportConfigOut)
async def create_report_config(
    data: ReportConfigCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = ReportConfig(
        user_id=user.id,
        name=data.name,
        report_type=data.report_type,
        frequency=data.frequency,
        target_user_id=data.target_user_id,
        target_project_id=data.target_project_id,
        target_client_name=data.target_client_name,
        send_email=data.send_email,
        email_to=data.email_to,
    )
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return ReportConfigOut(
        id=cfg.id,
        name=cfg.name,
        report_type=cfg.report_type.value,
        frequency=cfg.frequency.value,
        target_user_id=cfg.target_user_id,
        target_project_id=cfg.target_project_id,
        target_client_name=cfg.target_client_name,
        is_active=cfg.is_active,
        send_email=cfg.send_email,
        email_to=cfg.email_to,
        last_sent_at=None,
        created_at=cfg.created_at.isoformat() if cfg.created_at else "",
    )


@router.patch("/reports/configs/{config_id}", response_model=ReportConfigOut)
async def update_report_config(
    config_id: int,
    data: ReportConfigUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = await db.get(ReportConfig, config_id)
    if not cfg or cfg.user_id != user.id:
        raise HTTPException(status_code=404, detail="Config non trovata")
    if data.name is not None:
        cfg.name = data.name
    if data.is_active is not None:
        cfg.is_active = data.is_active
    if data.send_email is not None:
        cfg.send_email = data.send_email
    if data.email_to is not None:
        cfg.email_to = data.email_to
    await db.commit()
    await db.refresh(cfg)
    return ReportConfigOut(
        id=cfg.id,
        name=cfg.name,
        report_type=cfg.report_type.value,
        frequency=cfg.frequency.value,
        target_user_id=cfg.target_user_id,
        target_project_id=cfg.target_project_id,
        target_client_name=cfg.target_client_name,
        is_active=cfg.is_active,
        send_email=cfg.send_email,
        email_to=cfg.email_to,
        last_sent_at=cfg.last_sent_at.isoformat() if cfg.last_sent_at else None,
        created_at=cfg.created_at.isoformat() if cfg.created_at else "",
    )


@router.delete("/reports/configs/{config_id}")
async def delete_report_config(
    config_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = await db.get(ReportConfig, config_id)
    if not cfg or cfg.user_id != user.id:
        raise HTTPException(status_code=404, detail="Config non trovata")
    await db.delete(cfg)
    await db.commit()
    return {"detail": "Config eliminata"}


@router.post("/reports/configs/{config_id}/run-now")
async def run_report_config_now(
    config_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = await db.get(ReportConfig, config_id)
    if not cfg or cfg.user_id != user.id:
        raise HTTPException(status_code=404, detail="Config non trovata")

    from app.workers.tasks import run_periodic_report_now
    run_periodic_report_now.delay(config_id)
    return {"detail": "Report in generazione"}
