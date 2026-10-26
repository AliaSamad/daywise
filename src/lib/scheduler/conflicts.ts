import { buildDayFrame } from "./day";
import { addDaysLocal, durationMin, formatDuration, localDateOf, MINUTE, overlaps, type Interval } from "./time";
import type { CommitmentOccurrence, SchedulingPrefs } from "./types";

export interface CommitmentConflict {
  a: CommitmentOccurrence;
  b: CommitmentOccurrence;
  /** "overlap": the events themselves clash. "travel": only travel/buffer time clashes. */
  severity: "overlap" | "travel";
}

/** Every pair of occurrences that clash, either directly or through travel time. */
export function findCommitmentConflicts(occ: CommitmentOccurrence[]): CommitmentConflict[] {
  const sorted = occ.slice().sort((x, y) => x.blockStart - y.blockStart);
  const out: CommitmentConflict[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (b.blockStart >= a.blockEnd) break;
      if (a.commitmentId === b.commitmentId && a.date === b.date) continue;
      if (overlaps({ start: a.start, end: a.end }, { start: b.start, end: b.end })) {
        out.push({ a, b, severity: "overlap" });
      } else if (overlaps({ start: a.blockStart, end: a.blockEnd }, { start: b.blockStart, end: b.blockEnd })) {
        out.push({ a, b, severity: "travel" });
      }
    }
  }
  return out;
}

/** Ids of occurrences (commitmentId|date) involved in a direct overlap. */
export function conflictingOccurrenceKeys(conflicts: CommitmentConflict[]): Set<string> {
  const keys = new Set<string>();
  for (const c of conflicts) {
    if (c.severity !== "overlap") continue;
    keys.add(`${c.a.commitmentId}|${c.a.date}`);
    keys.add(`${c.b.commitmentId}|${c.b.date}`);
  }
  return keys;
}

export interface MoveCandidate {
  sessionId: string;
  taskTitle: string;
  start: number;
  end: number;
  deadline: number | null;
}

export interface OtherSession {
  id: string;
  kind: "task" | "break";
  title: string;
  start: number;
  end: number;
}

export interface MoveValidation {
  /** Hard problems block the move. */
  errors: string[];
  /** Soft problems are allowed after the user confirms. */
  warnings: string[];
}

/** Validate dragging a flexible task block to a new time. Pure and deterministic. */
export function validateSessionMove(args: {
  move: MoveCandidate;
  now: number;
  tz: string;
  prefs: SchedulingPrefs;
  occurrences: CommitmentOccurrence[];
  sessions: OtherSession[];
}): MoveValidation {
  const { move, now, tz, prefs } = args;
  const slot: Interval = { start: move.start, end: move.end };
  const errors: string[] = [];
  const warnings: string[] = [];

  if (move.end <= move.start) errors.push("A session needs a positive length.");
  if (move.start < now - MINUTE) errors.push("That time has already passed.");

  for (const o of args.occurrences) {
    if (overlaps(slot, { start: o.start, end: o.end })) {
      errors.push(`It overlaps “${o.title}”, a fixed commitment.`);
    } else if (overlaps(slot, { start: o.blockStart, end: o.blockEnd })) {
      warnings.push(`It cuts into travel time for “${o.title}”.`);
    }
  }

  const breakMs = prefs.breakMinutes * MINUTE;
  for (const s of args.sessions) {
    if (s.id === move.sessionId) continue;
    if (overlaps(slot, s)) {
      if (s.kind === "break") warnings.push("It replaces a planned break.");
      else errors.push(`It overlaps “${s.title}”.`);
    } else if (
      s.kind === "task" &&
      overlaps({ start: slot.start - breakMs, end: slot.end + breakMs }, s)
    ) {
      warnings.push(`There's no break between this and “${s.title}”.`);
    }
  }

  // Check against the frame of the day the block starts on, and the previous day's frame for
  // late-night blocks after midnight.
  const date = localDateOf(move.start, tz);
  const frame = buildDayFrame(date, prefs, tz);
  const awake = frame.awake.start <= slot.start && slot.end <= frame.awake.end;
  const prevFrame = buildDayFrame(addDaysLocal(date, -1), prefs, tz);
  const awakePrev = prevFrame.awake.start <= slot.start && slot.end <= prevFrame.awake.end;
  if (!awake && !awakePrev) {
    errors.push("That's outside your waking hours.");
  } else {
    const f = awake ? frame : prevFrame;
    if (!f.work || slot.start < f.work.start || slot.end > f.work.end) {
      warnings.push("It's outside your preferred working hours.");
    }
    for (const m of f.meals) if (overlaps(slot, m)) warnings.push("It overlaps a meal time.");
    if (f.isRestDay) warnings.push("This is one of your rest days.");
  }

  if (move.deadline !== null && move.end > move.deadline) {
    warnings.push(`It finishes after the deadline for “${move.taskTitle}”.`);
  }

  const sameDayFocus = args.sessions
    .filter((s) => s.kind === "task" && s.id !== move.sessionId && localDateOf(s.start, tz) === date)
    .reduce((sum, s) => sum + durationMin(s), 0);
  const total = sameDayFocus + durationMin(slot);
  if (total > prefs.maxFocusMinutes) {
    warnings.push(
      `That day would have ${formatDuration(total)} of focused work, above your ${formatDuration(prefs.maxFocusMinutes)} limit.`,
    );
  }

  return { errors: dedupe(errors), warnings: dedupe(warnings) };
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list));
}
