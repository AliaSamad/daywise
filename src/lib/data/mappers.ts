import type {
  Commitment,
  ExistingSession,
  SchedulingPrefs,
  Task,
} from "@/lib/scheduler/types";
import type { CommitmentRow, PrefsRow, SessionRow, TaskRow } from "./rows";

/** Postgres returns "HH:MM:SS"; the app works with "HH:MM". */
export const hhmm = (t: string) => t.slice(0, 5);
const hhmmOrNull = (t: string | null) => (t ? hhmm(t) : null);

export function toPrefs(r: PrefsRow): SchedulingPrefs {
  return {
    wakeTime: hhmm(r.wake_time),
    bedTime: hhmm(r.bed_time),
    workStart: hhmm(r.work_start),
    workEnd: hhmm(r.work_end),
    breakfastTime: hhmmOrNull(r.breakfast_time),
    lunchTime: hhmmOrNull(r.lunch_time),
    dinnerTime: hhmmOrNull(r.dinner_time),
    mealMinutes: r.meal_minutes,
    breakMinutes: r.break_minutes,
    focusPreference: r.focus_preference,
    maxFocusMinutes: r.max_focus_minutes,
    sessionMinutes: r.session_minutes,
    weekendMode: r.weekend_mode,
    bufferPercent: r.buffer_percent,
    windDownMinutes: r.wind_down_minutes,
  };
}

export function toCommitment(r: CommitmentRow): Commitment {
  const rr = r.recurrence_rules;
  return {
    id: r.id,
    title: r.title,
    kind: r.kind,
    location: r.location,
    startDate: r.start_date,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    timezone: r.timezone,
    recurrence: rr
      ? { freq: rr.freq, interval: rr.interval, byWeekday: rr.by_weekday, untilDate: rr.until_date }
      : null,
    travelBeforeMinutes: r.travel_before_minutes,
    travelAfterMinutes: r.travel_after_minutes,
    isMandatory: r.is_mandatory,
    exceptions: (r.commitment_exceptions ?? []).map((e) => e.occurrence_date),
  };
}

export function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    estimatedMinutes: r.estimated_minutes,
    deadline: r.deadline ? Date.parse(r.deadline) : null,
    priority: r.priority,
    category: r.category,
    splittable: r.splittable,
    minSessionMinutes: r.min_session_minutes,
    earliestStart: r.earliest_start,
    preferredTime: r.preferred_time,
    status: r.status,
  };
}

export function toSession(r: SessionRow): ExistingSession {
  return {
    id: r.id,
    taskId: r.task_id,
    kind: r.kind,
    start: Date.parse(r.start_at),
    end: Date.parse(r.end_at),
    status: r.status,
    locked: r.locked,
  };
}

/** Minutes of completed session time per task. */
export function completedMinutesByTask(rows: SessionRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.kind !== "task" || r.status !== "done" || !r.task_id) continue;
    out[r.task_id] = (out[r.task_id] ?? 0) + Math.round((Date.parse(r.end_at) - Date.parse(r.start_at)) / 60_000);
  }
  return out;
}
