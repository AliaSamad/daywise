import { TZDate } from "@date-fns/tz";
import { addDays as addDaysFns, format } from "date-fns";

/** A local calendar date in the user's timezone, formatted YYYY-MM-DD. */
export type LocalDate = string;
/** A wall-clock time, formatted HH:mm (seconds are ignored if present). */
export type LocalTime = string;

export const MINUTE = 60_000;

export interface Interval {
  start: number; // epoch ms, inclusive
  end: number; // epoch ms, exclusive
}

export function parseTime(t: LocalTime): { h: number; m: number } {
  const [h, m] = t.split(":").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time "${t}"`);
  }
  return { h, m };
}

export function timeToMinutes(t: LocalTime): number {
  const { h, m } = parseTime(t);
  return h * 60 + m;
}

export function minutesToTime(min: number): LocalTime {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function parseDate(d: LocalDate): { y: number; mo: number; da: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!match) throw new Error(`Invalid date "${d}"`);
  return { y: Number(match[1]), mo: Number(match[2]), da: Number(match[3]) };
}

/**
 * The instant at which the wall clock in `tz` shows `date time`.
 * During a DST gap (e.g. 01:30 on spring-forward night) this resolves forward.
 */
export function zonedInstant(date: LocalDate, time: LocalTime, tz: string): number {
  const { y, mo, da } = parseDate(date);
  const { h, m } = parseTime(time);
  return new TZDate(y, mo - 1, da, h, m, 0, 0, tz).getTime();
}

/** The local date (in `tz`) of an instant. */
export function localDateOf(instant: number | Date, tz: string): LocalDate {
  return format(new TZDate(typeof instant === "number" ? instant : instant.getTime(), tz), "yyyy-MM-dd");
}

/** Minutes since local midnight (in `tz`) of an instant. */
export function localMinutesOf(instant: number, tz: string): number {
  const d = new TZDate(instant, tz);
  return d.getHours() * 60 + d.getMinutes();
}

export function addDaysLocal(date: LocalDate, days: number): LocalDate {
  const { y, mo, da } = parseDate(date);
  // Use noon UTC to stay clear of any DST edge; we only care about the calendar date.
  const base = new Date(Date.UTC(y, mo - 1, da, 12));
  return addDaysFns(base, days).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: LocalDate): number {
  const { y, mo, da } = parseDate(date);
  return new Date(Date.UTC(y, mo - 1, da, 12)).getUTCDay();
}

export function daysBetween(a: LocalDate, b: LocalDate): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.mo - 1, pb.da) - Date.UTC(pa.y, pa.mo - 1, pa.da)) / 86_400_000);
}

export function dateRange(start: LocalDate, days: number): LocalDate[] {
  return Array.from({ length: days }, (_, i) => addDaysLocal(start, i));
}

/** Monday-based week start. */
export function startOfWeekLocal(date: LocalDate): LocalDate {
  const wd = weekdayOf(date);
  return addDaysLocal(date, wd === 0 ? -6 : 1 - wd);
}

/**
 * Turn a wall-clock span on a local date into an interval. If `end` is not after
 * `start` the span crosses midnight and ends on the following day.
 */
export function zonedSpan(date: LocalDate, start: LocalTime, end: LocalTime, tz: string): Interval {
  const s = zonedInstant(date, start, tz);
  const endDate = timeToMinutes(end) <= timeToMinutes(start) ? addDaysLocal(date, 1) : date;
  return { start: s, end: zonedInstant(endDate, end, tz) };
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function durationMin(i: Interval): number {
  return Math.round((i.end - i.start) / MINUTE);
}

/** Sort and merge overlapping/adjacent intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** `window` minus every interval in `busy`. */
export function subtractIntervals(window: Interval, busy: Interval[]): Interval[] {
  const free: Interval[] = [];
  let cursor = window.start;
  for (const b of mergeIntervals(busy)) {
    if (b.end <= cursor) continue;
    if (b.start >= window.end) break;
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, window.end) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}

export function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

/** Round an instant up to the next multiple of `step` minutes (in absolute time). */
export function ceilToStep(instant: number, stepMin: number): number {
  const step = stepMin * MINUTE;
  return Math.ceil(instant / step) * step;
}

export function formatDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}
