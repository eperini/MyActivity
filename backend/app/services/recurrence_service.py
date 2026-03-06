"""
Servizio per la gestione delle ricorrenze.

Gestisce:
- Parsing e calcolo occorrenze RRULE (RFC 5545)
- Workday adjustment: spostamento al giorno lavorativo target
- Generazione delle TaskInstance per i prossimi N giorni

Esempi di RRULE supportate:
- FREQ=DAILY                              -> ogni giorno
- FREQ=DAILY;INTERVAL=3                   -> ogni 3 giorni
- FREQ=WEEKLY;BYDAY=MO,TH                -> ogni lunedi e giovedi
- FREQ=MONTHLY;BYMONTHDAY=1              -> il primo di ogni mese
- FREQ=MONTHLY;BYDAY=1MO                 -> il primo lunedi del mese
- FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=1    -> 1 marzo ogni anno

Workday adjustment (per il caso "primo lunedi dopo il 1 del mese"):
- rrule = FREQ=MONTHLY;BYMONTHDAY=1
- workday_adjust = "next"
- workday_target = 0 (lunedi)
-> La data calcolata (1 del mese) viene spostata al prossimo lunedi
   se non cade gia di lunedi.
"""

from datetime import datetime, date, timedelta, timezone
from dateutil.rrule import rrulestr, rrule
from dateutil.rrule import DAILY, WEEKLY, MONTHLY, YEARLY

# Mapping giorno settimana: 0=lunedi, 6=domenica (come Python weekday())
DAY_NAMES = {0: "LU", 1: "MA", 2: "ME", 3: "GI", 4: "VE", 5: "SA", 6: "DO"}
RRULE_DAYS = {0: "MO", 1: "TU", 2: "WE", 3: "TH", 4: "FR", 5: "SA", 6: "SU"}


def build_rrule_string(
    frequency: str,
    interval: int = 1,
    days_of_week: list[int] | None = None,
    day_of_month: int | None = None,
    month: int | None = None,
    nth_weekday: int | None = None,
    nth_weekday_day: int | None = None,
) -> str:
    """
    Costruisce una stringa RRULE dai parametri semplificati.

    Args:
        frequency: "daily", "weekly", "monthly", "yearly"
        interval: ogni N periodi (default 1)
        days_of_week: [0,3] = lunedi e giovedi (per weekly)
        day_of_month: 1-31 (per monthly/yearly)
        month: 1-12 (per yearly)
        nth_weekday: 1=primo, 2=secondo, -1=ultimo (per monthly "primo lunedi")
        nth_weekday_day: 0-6 giorno della settimana per nth_weekday
    """
    freq_map = {"daily": "DAILY", "weekly": "WEEKLY", "monthly": "MONTHLY", "yearly": "YEARLY"}
    parts = [f"FREQ={freq_map[frequency]}"]

    if interval > 1:
        parts.append(f"INTERVAL={interval}")

    if frequency == "weekly" and days_of_week:
        days_str = ",".join(RRULE_DAYS[d] for d in sorted(days_of_week))
        parts.append(f"BYDAY={days_str}")

    if frequency == "monthly":
        if nth_weekday is not None and nth_weekday_day is not None:
            day_code = RRULE_DAYS[nth_weekday_day]
            parts.append(f"BYDAY={nth_weekday}{day_code}")
        elif day_of_month is not None:
            parts.append(f"BYMONTHDAY={day_of_month}")

    if frequency == "yearly":
        if month is not None:
            parts.append(f"BYMONTH={month}")
        if day_of_month is not None:
            parts.append(f"BYMONTHDAY={day_of_month}")

    return ";".join(parts)


def adjust_to_workday(dt: date, adjust: str, target_day: int) -> date:
    """
    Aggiusta una data al giorno lavorativo target.

    Args:
        dt: data originale calcolata dalla RRULE
        adjust: "next" (prossimo) o "prev" (precedente)
        target_day: 0=lunedi, 6=domenica

    Returns:
        Data aggiustata al giorno target.

    Esempio:
        dt = 2026-03-01 (domenica), adjust="next", target_day=0 (lunedi)
        -> 2026-03-02 (lunedi)

        dt = 2026-03-01 (domenica), adjust="prev", target_day=4 (venerdi)
        -> 2026-02-27 (venerdi)
    """
    current_day = dt.weekday()

    if current_day == target_day:
        return dt

    if adjust == "next":
        days_ahead = (target_day - current_day) % 7
        if days_ahead == 0:
            days_ahead = 7
        return dt + timedelta(days=days_ahead)
    elif adjust == "prev":
        days_back = (current_day - target_day) % 7
        if days_back == 0:
            days_back = 7
        return dt - timedelta(days=days_back)

    return dt


def get_occurrences(
    rrule_string: str,
    dtstart: date,
    after: date,
    count: int = 10,
    workday_adjust: str = "none",
    workday_target: int | None = None,
) -> list[date]:
    """
    Calcola le prossime N occorrenze di una RRULE.

    Args:
        rrule_string: stringa RRULE (es. "FREQ=WEEKLY;BYDAY=MO,TH")
        dtstart: data di inizio della ricorrenza
        after: calcola occorrenze dopo questa data
        count: numero massimo di occorrenze da restituire
        workday_adjust: "none", "next", "prev"
        workday_target: giorno target per l'aggiustamento (0=lunedi)

    Returns:
        Lista di date delle prossime occorrenze.
    """
    full_rrule = f"DTSTART:{dtstart.strftime('%Y%m%d')}\nRRULE:{rrule_string}"
    rule = rrulestr(full_rrule)

    # after deve essere un datetime per dateutil
    after_dt = datetime.combine(after, datetime.min.time())
    occurrences = []

    # Iteriamo sulla rrule cercando occorrenze dopo la data richiesta
    current = rule.after(after_dt - timedelta(days=1), inc=True)
    while current is not None and len(occurrences) < count:
        result_date = current.date()

        if result_date >= after:
            if workday_adjust != "none" and workday_target is not None:
                result_date = adjust_to_workday(result_date, workday_adjust, workday_target)
            occurrences.append(result_date)

        current = rule.after(current, inc=False)

    return occurrences


def get_next_occurrence(
    rrule_string: str,
    dtstart: date,
    after: date | None = None,
    workday_adjust: str = "none",
    workday_target: int | None = None,
) -> date | None:
    """Restituisce la prossima singola occorrenza."""
    if after is None:
        after = date.today()

    results = get_occurrences(
        rrule_string=rrule_string,
        dtstart=dtstart,
        after=after,
        count=1,
        workday_adjust=workday_adjust,
        workday_target=workday_target,
    )
    return results[0] if results else None


# --- Helper per creare RRULE comuni ---

def every_n_days(n: int = 1) -> str:
    return build_rrule_string("daily", interval=n)


def every_week_on(*days: int) -> str:
    """Es: every_week_on(0, 3) -> ogni lunedi e giovedi"""
    return build_rrule_string("weekly", days_of_week=list(days))


def every_month_on_day(day: int) -> str:
    """Es: every_month_on_day(15) -> il 15 di ogni mese"""
    return build_rrule_string("monthly", day_of_month=day)


def every_month_nth_weekday(nth: int, weekday: int) -> str:
    """Es: every_month_nth_weekday(1, 0) -> primo lunedi del mese"""
    return build_rrule_string("monthly", nth_weekday=nth, nth_weekday_day=weekday)


def every_year_on(month: int, day: int) -> str:
    """Es: every_year_on(3, 1) -> 1 marzo ogni anno"""
    return build_rrule_string("yearly", month=month, day_of_month=day)
