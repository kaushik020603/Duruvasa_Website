export interface Values { first: string; last: string; email: string; message: string }
export type Errors = Partial<Record<keyof Values, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type T = (key: string, fallback: string) => string;

export function validate(v: Values, t: T = (_k, fb) => fb): Errors {
  const e: Errors = {};
  if (!v.first.trim()) e.first = t("val.first", "Enter your first name");
  if (!v.last.trim()) e.last = t("val.last", "Enter your last name");
  if (!EMAIL.test(v.email.trim())) e.email = t("val.email", "Enter a valid email");
  if (v.message.trim().length < 10) e.message = t("val.message", "Please add a little more detail");
  return e;
}

/** Upcoming weekdays, skipping weekends, starting tomorrow. */
export function nextWeekdays(from: Date, count: number): Date[] {
  const out: Date[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (out.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(new Date(d));
  }
  return out;
}

export const SLOTS = ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00"];

/** Build a minimal iCalendar file for a 30 minute consultation. */
export function buildIcs(date: Date, slot: string, who: string): string {
  const [h, m] = slot.split(":").map(Number);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
  const end = new Date(start.getTime() + 30 * 60000);
  const f = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DuRuVaSa CloudSec//EN", "BEGIN:VEVENT",
    `UID:${f(start)}-${Math.random().toString(36).slice(2)}@duruvasa`,
    `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    `SUMMARY:Consultation with DuRuVaSa CloudSec`, `DESCRIPTION:Requested by ${who}. Time is pending confirmation.`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}
