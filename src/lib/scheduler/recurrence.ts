import type { Commitment, CommitmentOccurrence } from "./types";
import {
  addDaysLocal,
  daysBetween,
  MINUTE,
  startOfWeekLocal,
  weekdayOf,
  zonedInstant,
  zonedSpan,
  type LocalDate,
} from "./time";

/** Does the commitment have an occurrence starting on `date`? */
export function occursOn(c: Commitment, date: LocalDate): boolean {
  if (daysBetween(c.startDate, date) < 0) return false;
  if (c.exceptions.includes(date)) return false;
  const r = c.recurrence;
  if (!r) return date === c.startDate;
  if (r.untilDate && daysBetween(r.untilDate, date) > 0) return false;
  const interval = Math.max(1, r.interval);
  if (r.freq === "daily") return daysBetween(c.startDate, date) % interval === 0;
  const weekdays = r.byWeekday && r.byWeekday.length > 0 ? r.byWeekday : [weekdayOf(c.startDate)];
  if (!weekdays.includes(weekdayOf(date))) return false;
  const weeks = daysBetween(startOfWeekLocal(c.startDate), startOfWeekLocal(date)) / 7;
  return weeks % interval === 0;
}

/**
 * Expand a commitment into concrete occurrences overlapping [from, to] (inclusive local dates).
 * Occurrences are computed in the commitment's own timezone, so a 09:00 lecture stays at
 * 09:00 local time across daylight-saving changes.
 */
export function expandCommitment(c: Commitment, from: LocalDate, to: LocalDate): CommitmentOccurrence[] {
  const out: CommitmentOccurrence[] = [];
  // Start one day early so an overnight occurrence from the previous evening is included.
  const total = daysBetween(from, to) + 1;
  for (let i = -1; i < total; i++) {
    const date = addDaysLocal(from, i);
    if (!occursOn(c, date)) continue;
    const span = zonedSpan(date, c.startTime, c.endTime, c.timezone);
    // Only keep the previous day's occurrence if it spills past midnight into `from`.
    if (i === -1 && span.end <= zonedInstant(from, "00:00", c.timezone)) continue;
    out.push({
      commitmentId: c.id,
      title: c.title,
      kind: c.kind,
      location: c.location,
      isMandatory: c.isMandatory,
      date,
      start: span.start,
      end: span.end,
      blockStart: span.start - c.travelBeforeMinutes * MINUTE,
      blockEnd: span.end + c.travelAfterMinutes * MINUTE,
    });
  }
  return out;
}

export function expandCommitments(list: Commitment[], from: LocalDate, to: LocalDate): CommitmentOccurrence[] {
  return list.flatMap((c) => expandCommitment(c, from, to)).sort((a, b) => a.start - b.start);
}

export function describeRecurrence(c: Pick<Commitment, "recurrence" | "startDate">): string {
  const r = c.recurrence;
  if (!r) return "One-time";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const until = r.untilDate ? ` until ${r.untilDate}` : "";
  if (r.freq === "daily") return (r.interval === 1 ? "Every day" : `Every ${r.interval} days`) + until;
  const days = (r.byWeekday && r.byWeekday.length ? r.byWeekday : [weekdayOf(c.startDate)])
    .slice()
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => names[d])
    .join(", ");
  const every = r.interval === 1 ? "Weekly" : `Every ${r.interval} weeks`;
  return `${every} on ${days}${until}`;
}
