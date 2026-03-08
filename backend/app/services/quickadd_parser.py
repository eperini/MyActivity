"""Natural language parser for quick task creation (Italian)."""
import re
from dataclasses import dataclass, field
from datetime import date, time, timedelta


WEEKDAYS_IT = {
    "lunedì": 0, "lunedi": 0,
    "martedì": 1, "martedi": 1,
    "mercoledì": 2, "mercoledi": 2,
    "giovedì": 3, "giovedi": 3,
    "venerdì": 4, "venerdi": 4,
    "sabato": 5,
    "domenica": 6,
}


@dataclass
class ParsedTask:
    title: str = ""
    priority: int = 4
    due_date: date | None = None
    due_time: time | None = None
    tag_names: list[str] = field(default_factory=list)


def _next_weekday(weekday: int, skip_today: bool = False) -> date:
    today = date.today()
    days_ahead = weekday - today.weekday()
    if days_ahead < 0 or (days_ahead == 0 and skip_today):
        days_ahead += 7
    return today + timedelta(days=days_ahead)


def parse_quick_add(text: str) -> ParsedTask:
    result = ParsedTask()
    remaining = text.strip()

    # 1. Extract priority: p1, p2, p3, p4
    m = re.search(r'\bp([1-4])\b', remaining, re.IGNORECASE)
    if m:
        result.priority = int(m.group(1))
        remaining = remaining[:m.start()] + remaining[m.end():]

    # 2. Extract tags: #tag_name
    tags = re.findall(r'#(\w+)', remaining)
    if tags:
        result.tag_names = [t.lower() for t in tags]
        remaining = re.sub(r'#\w+', '', remaining)

    # 3. Extract time: "alle 14:30", "alle 9", "14:30"
    m = re.search(r'\balle\s+(\d{1,2})(?::(\d{2}))?\b', remaining, re.IGNORECASE)
    if m:
        h, mi = int(m.group(1)), int(m.group(2) or 0)
        if 0 <= h <= 23 and 0 <= mi <= 59:
            result.due_time = time(h, mi)
            remaining = remaining[:m.start()] + remaining[m.end():]
    else:
        m = re.search(r'\b(\d{1,2}):(\d{2})\b', remaining)
        if m:
            h, mi = int(m.group(1)), int(m.group(2))
            if 0 <= h <= 23 and 0 <= mi <= 59:
                result.due_time = time(h, mi)
                remaining = remaining[:m.start()] + remaining[m.end():]

    # 4. Extract date
    today = date.today()

    # "tra N giorni"
    m = re.search(r'\btra\s+(\d+)\s+giorn[io]\b', remaining, re.IGNORECASE)
    if m:
        result.due_date = today + timedelta(days=int(m.group(1)))
        remaining = remaining[:m.start()] + remaining[m.end():]
    else:
        # DD/MM or DD/MM/YYYY
        m = re.search(r'\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b', remaining)
        if m:
            day, month = int(m.group(1)), int(m.group(2))
            year = int(m.group(3)) if m.group(3) else today.year
            if year < 100:
                year += 2000
            try:
                result.due_date = date(year, month, day)
                remaining = remaining[:m.start()] + remaining[m.end():]
            except ValueError:
                pass

    if not result.due_date:
        # "prossimo lunedì" etc
        m = re.search(r'\bprossim[oa]?\s+(' + '|'.join(WEEKDAYS_IT.keys()) + r')\b', remaining, re.IGNORECASE)
        if m:
            wd = WEEKDAYS_IT[m.group(1).lower()]
            result.due_date = _next_weekday(wd, skip_today=True)
            remaining = remaining[:m.start()] + remaining[m.end():]
        else:
            # Weekday name alone
            lower = remaining.lower()
            for name, wd in WEEKDAYS_IT.items():
                pattern = r'\b' + re.escape(name) + r'\b'
                m = re.search(pattern, lower)
                if m:
                    result.due_date = _next_weekday(wd)
                    remaining = remaining[:m.start()] + remaining[m.end():]
                    break

    if not result.due_date:
        # Simple keywords
        lower = remaining.lower()
        if re.search(r'\bdopodomani\b', lower):
            result.due_date = today + timedelta(days=2)
            remaining = re.sub(r'\bdopodomani\b', '', remaining, flags=re.IGNORECASE)
        elif re.search(r'\bdomani\b', lower):
            result.due_date = today + timedelta(days=1)
            remaining = re.sub(r'\bdomani\b', '', remaining, flags=re.IGNORECASE)
        elif re.search(r'\boggi\b', lower):
            result.due_date = today
            remaining = re.sub(r'\boggi\b', '', remaining, flags=re.IGNORECASE)

    # 5. Clean up remaining text as title
    result.title = re.sub(r'\s+', ' ', remaining).strip()

    return result
