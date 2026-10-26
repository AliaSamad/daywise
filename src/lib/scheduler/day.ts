import type { CommitmentOccurrence, SchedulingPrefs, TimeOfDay } from "./types";
import {
  addDaysLocal,
  intersect,
  MINUTE,
  timeToMinutes,
  weekdayOf,
  zonedInstant,
  zonedSpan,
  type Interval,
  type LocalDate,
} from "./time";

export interface DayFrame {
  date: LocalDate;
  /** Wake-up until bedtime minus wind-down: when anything may be scheduled. */
  awake: Interval;
  /** Preferred working hours clipped to the awake window: where tasks go. */
  work: Interval | null;
  meals: (Interval & { label: string })[];
  isWeekend: boolean;
  isRestDay: boolean;
  /** Fraction of normal focus capacity allowed today. */
  capacityFactor: number;
}

export function buildDayFrame(date: LocalDate, prefs: SchedulingPrefs, tz: string): DayFrame {
  const wd = weekdayOf(date);
  const isWeekend = wd === 0 || wd === 6;
  const isRestDay = isWeekend && prefs.weekendMode === "rest";
  const capacityFactor = isWeekend ? (prefs.weekendMode === "work" ? 1 : prefs.weekendMode === "light" ? 0.5 : 0) : 1;

  const sleep = zonedSpan(date, prefs.wakeTime, prefs.bedTime, tz);
  const awake: Interval = { start: sleep.start, end: sleep.end - prefs.windDownMinutes * MINUTE };
  if (awake.end <= awake.start) awake.end = sleep.end;

  const workSpan = zonedSpan(date, prefs.workStart, prefs.workEnd, tz);
  const work = intersect(workSpan, awake);

  const meals: DayFrame["meals"] = [];
  const mealTimes: [string, string | null][] = [
    ["Breakfast", prefs.breakfastTime],
    ["Lunch", prefs.lunchTime],
    ["Dinner", prefs.dinnerTime],
  ];
  for (const [label, t] of mealTimes) {
    if (!t) continue;
    // A meal time earlier than wake-up belongs to the next calendar day (night owls).
    const mealDate = timeToMinutes(t) < timeToMinutes(prefs.wakeTime) ? addDaysLocal(date, 1) : date;
    const start = zonedInstant(mealDate, t, tz);
    const meal = { start, end: start + prefs.mealMinutes * MINUTE };
    const clipped = intersect(meal, awake);
    if (clipped) meals.push({ ...clipped, label });
  }

  return { date, awake, work, meals, isWeekend, isRestDay, capacityFactor };
}

/** The window (absolute instants) that counts as morning/afternoon/evening on a day. */
export function timeOfDayBand(frame: DayFrame, band: TimeOfDay, tz: string): Interval {
  const noon = zonedInstant(frame.date, "12:00", tz);
  const five = zonedInstant(frame.date, "17:00", tz);
  if (band === "morning") return { start: frame.awake.start, end: noon };
  if (band === "afternoon") return { start: noon, end: five };
  return { start: five, end: frame.awake.end };
}

export function occurrencesOnDay(frame: DayFrame, occ: CommitmentOccurrence[]): CommitmentOccurrence[] {
  return occ.filter((o) => o.blockStart < frame.awake.end && o.blockEnd > frame.awake.start);
}
