"""PDF report generator using reportlab."""
from __future__ import annotations

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable,
)

from app.services.report_service import ReportData


def _fmt_minutes(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    if h and m:
        return f"{h}h {m}m"
    elif h:
        return f"{h}h"
    return f"{m}m"


class PDFGenerator:

    COLOR_PRIMARY = colors.HexColor("#2196F3")
    COLOR_SUCCESS = colors.HexColor("#4CAF50")
    COLOR_WARNING = colors.HexColor("#FF9800")
    COLOR_DANGER = colors.HexColor("#F44336")
    COLOR_LIGHT = colors.HexColor("#F5F5F5")
    COLOR_DARK = colors.HexColor("#212121")
    COLOR_MUTED = colors.HexColor("#757575")

    def generate(self, data: ReportData, output_path: str) -> str:
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=2 * cm, leftMargin=2 * cm,
            topMargin=2 * cm, bottomMargin=2 * cm,
            title=data.title,
            author="Zeno",
        )
        story = []
        story += self._build_header(data)
        story += self._build_kpi_row(data)
        story += self._build_trend_section(data)
        story += self._build_projects_section(data)
        if data.persons:
            story += self._build_persons_section(data)
        story += self._build_task_detail_section(data)
        doc.build(story)
        return output_path

    def _build_header(self, data: ReportData) -> list:
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "ReportTitle", parent=styles["Title"],
            fontSize=20, textColor=self.COLOR_PRIMARY, spaceAfter=4,
        )
        sub_style = ParagraphStyle(
            "ReportSub", parent=styles["Normal"],
            fontSize=10, textColor=self.COLOR_MUTED, spaceAfter=12,
        )
        period = f"{data.period_from} — {data.period_to}"
        generated = data.generated_at[:16].replace("T", " ")
        return [
            Paragraph(data.title, title_style),
            Paragraph(f"Periodo: {period} &middot; Generato il {generated}", sub_style),
            HRFlowable(width="100%", thickness=2, color=self.COLOR_PRIMARY),
            Spacer(1, 0.4 * cm),
        ]

    def _build_kpi_row(self, data: ReportData) -> list:
        styles = getSampleStyleSheet()
        kpis = [
            ("Ore lavorate", _fmt_minutes(data.total_logged_minutes), self.COLOR_PRIMARY),
            ("Task completati", str(data.total_done_tasks), self.COLOR_SUCCESS),
            ("Task aperti", str(data.total_open_tasks), self.COLOR_WARNING),
            ("Completamento", f"{data.avg_completion_pct:.0f}%", self.COLOR_DARK),
        ]
        cells = []
        for label, value, color in kpis:
            cells.append([
                Paragraph(f'<font color="{color.hexval()}" size="18"><b>{value}</b></font>',
                          styles["Normal"]),
                Paragraph(f'<font color="#757575" size="9">{label}</font>',
                          styles["Normal"]),
            ])
        t = Table([cells], colWidths=[4.5 * cm] * 4)
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
            ("BACKGROUND", (0, 0), (-1, -1), self.COLOR_LIGHT),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
        return [t, Spacer(1, 0.5 * cm)]

    def _build_trend_section(self, data: ReportData) -> list:
        styles = getSampleStyleSheet()
        h2 = ParagraphStyle("H2Trend", parent=styles["Heading2"],
                            fontSize=12, textColor=self.COLOR_DARK, spaceBefore=8)

        def trend_str(pct):
            if pct > 0:
                return f'<font color="#4CAF50">+{pct:.1f}%</font>'
            elif pct < 0:
                return f'<font color="#F44336">{pct:.1f}%</font>'
            return '<font color="#757575">= invariato</font>'

        rows = [
            ["Metrica", "Periodo corrente", "Periodo precedente", "Trend"],
            [
                "Ore lavorate",
                _fmt_minutes(data.total_logged_minutes),
                _fmt_minutes(data.prev_logged_minutes),
                Paragraph(trend_str(data.trend_minutes_pct), styles["Normal"]),
            ],
            [
                "Task completati",
                str(data.total_done_tasks),
                str(data.prev_done_tasks),
                Paragraph(trend_str(data.trend_tasks_pct), styles["Normal"]),
            ],
        ]
        t = Table(rows, colWidths=[5 * cm, 3.5 * cm, 3.5 * cm, 3.5 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), self.COLOR_PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [self.COLOR_LIGHT, colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        return [Paragraph("Confronto periodo precedente", h2), t, Spacer(1, 0.5 * cm)]

    def _build_projects_section(self, data: ReportData) -> list:
        styles = getSampleStyleSheet()
        h2 = ParagraphStyle("H2Proj", parent=styles["Heading2"],
                            fontSize=12, textColor=self.COLOR_DARK, spaceBefore=8)

        rows = [["Progetto", "Cliente", "Stato", "Task", "Ore", "% Compl."]]
        for p in data.projects:
            pct_bar = "=" * int(p.completion_pct / 10) + "-" * (10 - int(p.completion_pct / 10))
            rows.append([
                p.name,
                p.client_name or "—",
                p.status,
                f"{p.done_tasks}/{p.total_tasks}",
                _fmt_minutes(p.logged_minutes),
                f"[{pct_bar}] {p.completion_pct:.0f}%",
            ])

        t = Table(rows, colWidths=[4.5 * cm, 3 * cm, 2 * cm, 2 * cm, 2 * cm, 3 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), self.COLOR_PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [self.COLOR_LIGHT, colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
            ("FONTNAME", (-1, 1), (-1, -1), "Courier"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
        ]))
        return [Paragraph("Riepilogo progetti", h2), t, Spacer(1, 0.5 * cm)]

    def _build_persons_section(self, data: ReportData) -> list:
        styles = getSampleStyleSheet()
        h2 = ParagraphStyle("H2Pers", parent=styles["Heading2"],
                            fontSize=12, textColor=self.COLOR_DARK, spaceBefore=8)

        rows = [["Persona", "Ore", "Task completati", "Progetti"]]
        for person in data.persons:
            rows.append([
                person.display_name,
                _fmt_minutes(person.logged_minutes),
                str(person.done_tasks),
                ", ".join(person.projects),
            ])

        t = Table(rows, colWidths=[4 * cm, 3 * cm, 3 * cm, 6.5 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), self.COLOR_PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [self.COLOR_LIGHT, colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        return [Paragraph("Per persona", h2), t, Spacer(1, 0.5 * cm)]

    def _build_task_detail_section(self, data: ReportData) -> list:
        styles = getSampleStyleSheet()
        h2 = ParagraphStyle("H2Task", parent=styles["Heading2"],
                            fontSize=12, textColor=self.COLOR_DARK, spaceBefore=8)
        h3 = ParagraphStyle("H3Task", parent=styles["Heading3"],
                            fontSize=10, textColor=self.COLOR_MUTED, spaceBefore=6)
        result = [Paragraph("Task completati nel periodo", h2)]

        for p in data.projects:
            done = [t for t in p.tasks if t.status == "done"]
            if not done:
                continue
            result.append(Paragraph(p.name, h3))
            rows = [["Task", "Completato il", "Ore"]]
            for t in done:
                rows.append([
                    t.title,
                    t.completed_at or "—",
                    _fmt_minutes(t.logged_minutes),
                ])
            tbl = Table(rows, colWidths=[10 * cm, 3 * cm, 2.5 * cm])
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E3F2FD")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, self.COLOR_LIGHT]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
            ]))
            result += [tbl, Spacer(1, 0.3 * cm)]

        return result
