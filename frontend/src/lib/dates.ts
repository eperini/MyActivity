import { format, isToday, isTomorrow, isThisWeek, isThisYear, differenceInDays, parseISO } from "date-fns";
import { it } from "date-fns/locale";

export function formatRelativeDate(dateStr: string): string {
  const date = parseISO(dateStr);
  const now = new Date();
  const diff = differenceInDays(date, now);

  if (isToday(date)) return "Oggi";
  if (isTomorrow(date)) return "Domani";
  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff === 1) return "Ieri";
    return `${absDiff}g fa`;
  }
  if (diff <= 7) {
    return format(date, "EEEE", { locale: it }); // "Lunedì", "Martedì"...
  }
  if (isThisYear(date)) {
    return format(date, "d MMM", { locale: it }); // "16 mar"
  }
  return format(date, "d MMM yy", { locale: it }); // "16 mar 27"
}

export function isOverdue(dateStr: string): boolean {
  return differenceInDays(parseISO(dateStr), new Date()) < 0;
}
