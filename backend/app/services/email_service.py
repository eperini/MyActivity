"""Email service for sending daily reports and periodic report emails."""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication

from app.core.config import settings


def send_email(to: str, subject: str, html_body: str) -> bool:
    """Send an HTML email via SMTP."""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, to, msg.as_string())
        return True
    except Exception as e:
        print(f"Email send error: {e}")
        return False


def send_report_email(to: str, subject: str, data, pdf_path: str) -> bool:
    """Send a report email with PDF attachment and inline summary."""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        return False

    def fmt(m):
        h, mn = divmod(m, 60)
        return f"{h}h {mn}m" if mn else f"{h}h"

    trend_ore = f"{'▲' if data.trend_minutes_pct >= 0 else '▼'} {abs(data.trend_minutes_pct):.1f}%"
    trend_task = f"{'▲' if data.trend_tasks_pct >= 0 else '▼'} {abs(data.trend_tasks_pct):.1f}%"

    body_text = f"""{data.title}
Periodo: {data.period_from} - {data.period_to}

RIEPILOGO
─────────────────────────
Ore lavorate:     {fmt(data.total_logged_minutes)} ({trend_ore} vs periodo prec.)
Task completati:  {data.total_done_tasks} ({trend_task} vs periodo prec.)
Task aperti:      {data.total_open_tasks}
Completamento:    {data.avg_completion_pct:.0f}%

PROGETTI
─────────────────────────
""" + "\n".join(
        f"• {p.name}: {p.done_tasks}/{p.total_tasks} task · {fmt(p.logged_minutes)}"
        for p in data.projects
    ) + "\n\nReport completo in allegato."

    msg = MIMEMultipart("mixed")
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body_text, "plain"))

    with open(pdf_path, "rb") as f:
        pdf_part = MIMEApplication(f.read(), _subtype="pdf")
        pdf_part.add_header("Content-Disposition", "attachment", filename=f"{subject}.pdf")
        msg.attach(pdf_part)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, to, msg.as_string())
        return True
    except Exception as e:
        print(f"Report email send error: {e}")
        return False
