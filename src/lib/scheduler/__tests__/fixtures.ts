import type { Commitment, PlanInput, SchedulingPrefs, Task } from "../types";
import { dateRange, zonedInstant } from "../time";

export const TZ = "Europe/London";

export const prefs: SchedulingPrefs = {
  wakeTime: "07:30",
  bedTime: "23:00",
  workStart: "09:00",
  workEnd: "18:00",
  breakfastTime: "08:00",
  lunchTime: "12:30",
  dinnerTime: "18:30",
  mealMinutes: 30,
  breakMinutes: 10,
  focusPreference: "morning",
  maxFocusMinutes: 300,
  sessionMinutes: 50,
  weekendMode: "rest",
  bufferPercent: 15,
  windDownMinutes: 60,
};

/** Monday 26 Oct 2026, the day after UK clocks go back. */
export const MONDAY = "2026-10-26";
export const at = (date: string, time: string) => zonedInstant(date, time, TZ);

let seq = 0;
export function task(partial: Partial<Task> & { title: string }): Task {
  seq += 1;
  return {
    id: partial.id ?? `t${String(seq).padStart(3, "0")}`,
    estimatedMinutes: 60,
    deadline: null,
    priority: "medium",
    category: "study",
    splittable: true,
    minSessionMinutes: 25,
    earliestStart: null,
    preferredTime: null,
    status: "not_started",
    ...partial,
  };
}

export function commitment(partial: Partial<Commitment> & { id: string; title: string }): Commitment {
  return {
    kind: "lecture",
    location: null,
    startDate: MONDAY,
    startTime: "10:00",
    endTime: "11:00",
    timezone: TZ,
    recurrence: null,
    travelBeforeMinutes: 0,
    travelAfterMinutes: 0,
    isMandatory: true,
    exceptions: [],
    ...partial,
  };
}

export function baseInput(over: Partial<PlanInput> = {}): PlanInput {
  return {
    now: at(MONDAY, "08:00"),
    timezone: TZ,
    days: dateRange(MONDAY, 7),
    prefs,
    tasks: [],
    occurrences: [],
    existingSessions: [],
    ...over,
  };
}
