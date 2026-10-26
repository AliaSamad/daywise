/** Formatting helpers that always use the user's time zone, never the server's. */

export function fmtTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(ms);
}

export function fmtRange(start: number, end: number, tz: string): string {
  return `${fmtTime(start, tz)} – ${fmtTime(end, tz)}`;
}

export function fmtDayLong(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function fmtDayShort(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function fmtWeekday(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

/** Deadline label; end-of-day deadlines (23:59) omit the time. */
export function fmtDeadline(ms: number, tz: string): string {
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(ms);
  const time = fmtTime(ms, tz);
  return time === "23:59" ? day : `${day}, ${time}`;
}

/** "in 3h", "in 2 days", "2 days ago". */
export function relative(ms: number, now = Date.now()): string {
  const diffMin = Math.round((ms - now) / 60_000);
  const abs = Math.abs(diffMin);
  let text: string;
  if (abs < 60) text = `${abs} min`;
  else if (abs < 60 * 36) text = `${Math.round(abs / 60)}h`;
  else text = `${Math.round(abs / 1440)} days`;
  return diffMin >= 0 ? `in ${text}` : `${text} ago`;
}
