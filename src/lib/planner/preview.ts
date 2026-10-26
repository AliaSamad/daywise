import { isKeptSession, planSchedule } from "@/lib/scheduler/engine";
import { buildDayFrame } from "@/lib/scheduler/day";
import {
  addDaysLocal,
  dateRange,
  daysBetween,
  durationMin,
  localDateOf,
  MINUTE,
  startOfWeekLocal,
  zonedInstant,
  type LocalDate,
} from "@/lib/scheduler/time";
import type {
  AtRiskTask,
  DayLoad,
  ExistingSession,
  PlannedSession,
  SchedulingPrefs,
  Suggestion,
  UnscheduledTask,
} from "@/lib/scheduler/types";
import type { Workspace } from "@/lib/data/load";
import { toSession, toTask } from "@/lib/data/mappers";

export type PlanScope = "day" | "week" | "replan";

export interface PlanOptions {
  scope: PlanScope;
  /** Monday of the week to plan (week scope). Defaults to the current week. */
  weekStart?: LocalDate;
  /** Replan: minutes from now that are unavailable (running late, a break, something came up). */
  delayMinutes?: number;
  /** Replan: a task that is taking longer than estimated. */
  extraTime?: { taskId: string; minutes: number };
}

export interface TaskChange {
  taskId: string;
  title: string;
  beforeMinutes: number;
  afterMinutes: number;
  /** Planned minutes on the first day of the range before vs after (shows work moved later). */
  beforeFirstDay: number;
  afterFirstDay: number;
}

export interface PlanPreview {
  scope: PlanScope;
  title: string;
  rangeStart: number;
  rangeEnd: number;
  firstDay: LocalDate;
  sessions: (PlannedSession & { title: string })[];
  removedCount: number;
  changes: TaskChange[];
  deferred: { taskId: string; title: string; minutes: number }[];
  unscheduled: UnscheduledTask[];
  atRisk: AtRiskTask[];
  days: DayLoad[];
  suggestions: Suggestion[];
  feasible: boolean;
  headline: string;
  extraTime: { taskId: string; minutes: number } | null;
  missedCount: number;
}

/** The planning window for a scope, as local dates plus the absolute range that will be replaced. */
export function planWindow(
  opts: PlanOptions,
  now: number,
  tz: string,
  prefs: SchedulingPrefs,
): { horizon: LocalDate[]; rangeStart: number; rangeEnd: number; title: string } {
  const today = localDateOf(now, tz);
  if (opts.scope === "week") {
    const weekStart = opts.weekStart ?? startOfWeekLocal(today);
    const last = addDaysLocal(weekStart, 6);
    if (daysBetween(today, last) < 0) throw new Error("That week is already over.");
    const first = daysBetween(today, weekStart) > 0 ? weekStart : today;
    const horizon = dateRange(first, daysBetween(first, last) + 1);
    const lastFrame = buildDayFrame(last, prefs, tz);
    return {
      horizon,
      rangeStart: zonedInstant(first, "00:00", tz),
      rangeEnd: Math.max(zonedInstant(addDaysLocal(last, 1), "00:00", tz), lastFrame.awake.end),
      title: first === weekStart ? "Your week plan" : "The rest of your week",
    };
  }
  const horizon = dateRange(today, 7);
  if (opts.scope === "day") {
    const frame = buildDayFrame(today, prefs, tz);
    return {
      horizon,
      rangeStart: zonedInstant(today, "00:00", tz),
      rangeEnd: Math.max(zonedInstant(addDaysLocal(today, 1), "00:00", tz), frame.awake.end),
      title: "Today's plan",
    };
  }
  return {
    horizon,
    rangeStart: now,
    rangeEnd: zonedInstant(addDaysLocal(today, 7), "00:00", tz),
    title: "Your updated plan",
  };
}

/** Pure: build a preview of what planning would change. Nothing is saved. */
export function buildPlanPreview(args: {
  opts: PlanOptions;
  now: number;
  tz: string;
  prefs: SchedulingPrefs;
  ws: Workspace;
}): PlanPreview {
  const { opts, now, tz, prefs, ws } = args;
  const win = planWindow(opts, now, tz, prefs);
  const inRange = (start: number) => start >= win.rangeStart && start < win.rangeEnd;
  const delay = Math.max(0, Math.min(opts.delayMinutes ?? 0, 12 * 60));
  const planNow = now + delay * MINUTE;

  const extra = opts.extraTime && opts.extraTime.minutes > 0 ? opts.extraTime : null;
  const tasks = ws.tasks.map(toTask).map((t) =>
    extra && t.id === extra.taskId ? { ...t, estimatedMinutes: t.estimatedMinutes + extra.minutes } : t,
  );
  const taskTitle = new Map(ws.tasks.map((t) => [t.id, t.title]));

  // Sessions outside the window stay exactly where they are.
  const existing: ExistingSession[] = ws.sessions.map(toSession).map((s) => (inRange(s.start) ? s : { ...s, locked: true }));
  const replaced = existing.filter((s) => !isKeptSession(s, now) && inRange(s.start));
  const missedCount = existing.filter((s) => s.kind === "task" && s.status === "planned" && s.end <= now).length;

  const result = planSchedule({
    now: planNow,
    timezone: tz,
    days: win.horizon,
    prefs,
    tasks,
    occurrences: ws.occurrences,
    // Replaced sessions are judged against the real clock, so blocks inside a "running late"
    // gap are freed up too.
    existingSessions: existing.filter((s) => !replaced.includes(s)),
    completedMinutes: ws.completedMinutes,
  });

  const applied = result.sessions.filter((s) => inRange(s.start));
  const notApplied = result.sessions.filter((s) => !inRange(s.start) && s.kind === "task");

  const firstDay = win.horizon[0];
  const isFirstDay = (t: number) => localDateOf(t, tz) === firstDay;
  const byTask = new Map<string, TaskChange>();
  const touch = (taskId: string) => {
    let c = byTask.get(taskId);
    if (!c) {
      c = { taskId, title: taskTitle.get(taskId) ?? "Task", beforeMinutes: 0, afterMinutes: 0, beforeFirstDay: 0, afterFirstDay: 0 };
      byTask.set(taskId, c);
    }
    return c;
  };
  for (const s of replaced) {
    if (s.kind !== "task" || !s.taskId) continue;
    const c = touch(s.taskId);
    c.beforeMinutes += durationMin(s);
    if (isFirstDay(s.start)) c.beforeFirstDay += durationMin(s);
  }
  for (const s of applied) {
    if (s.kind !== "task" || !s.taskId) continue;
    const c = touch(s.taskId);
    c.afterMinutes += durationMin(s);
    if (isFirstDay(s.start)) c.afterFirstDay += durationMin(s);
  }

  const deferredMap = new Map<string, number>();
  for (const s of notApplied) if (s.taskId) deferredMap.set(s.taskId, (deferredMap.get(s.taskId) ?? 0) + durationMin(s));

  const rangeDays = new Set(opts.scope === "day" ? [firstDay] : win.horizon);
  return {
    scope: opts.scope,
    title: win.title,
    rangeStart: win.rangeStart,
    rangeEnd: win.rangeEnd,
    firstDay,
    sessions: applied.map((s) => ({ ...s, title: s.taskId ? taskTitle.get(s.taskId) ?? "Task" : "Break" })),
    removedCount: replaced.length,
    changes: Array.from(byTask.values()).sort((a, b) => b.afterMinutes - a.afterMinutes),
    deferred: Array.from(deferredMap.entries()).map(([taskId, minutes]) => ({ taskId, title: taskTitle.get(taskId) ?? "Task", minutes })),
    unscheduled: result.unscheduled,
    atRisk: result.atRisk,
    days: result.days.filter((d) => rangeDays.has(d.date)),
    suggestions: result.suggestions,
    feasible: result.feasible,
    headline: result.headline,
    extraTime: extra,
    missedCount,
  };
}
