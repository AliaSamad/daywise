import type { CalendarItem } from "@/lib/calendar/items";
import type { PlanPreview } from "@/lib/planner/preview";
import { buildDayFrame } from "@/lib/scheduler/day";
import { sortTasksForPlanning } from "@/lib/scheduler/engine";
import { durationMin, intersect, localDateOf, subtractIntervals, type Interval, type LocalDate } from "@/lib/scheduler/time";
import type { SchedulingPrefs, Task } from "@/lib/scheduler/types";

export type Feasibility = "empty" | "on_track" | "tight" | "overloaded" | "needs_plan";

export interface DashboardSummary {
  current: CalendarItem | null;
  next: CalendarItem | null;
  top: { task: Task; remaining: number; scheduledToday: number }[];
  progress: { doneMinutes: number; plannedMinutes: number; tasksCompletedToday: number };
  freeMinutes: number;
  workloadMinutes: number;
  capacityMinutes: number;
  plannedTodayMinutes: number;
  feasibility: Feasibility;
  feasibilityText: string;
  missed: CalendarItem[];
  unscheduledToday: { taskId: string; title: string; minutes: number }[];
}

export function buildDashboard(args: {
  now: number;
  tz: string;
  today: LocalDate;
  prefs: SchedulingPrefs;
  items: CalendarItem[];
  tasks: Task[];
  completedTodayCount: number;
  remainingByTask: Record<string, number>;
  dayPreview: PlanPreview;
}): DashboardSummary {
  const { now, tz, today, prefs, items, tasks, dayPreview } = args;
  const frame = buildDayFrame(today, prefs, tz);
  const todays = items.filter((i) => i.start < frame.awake.end + prefs.windDownMinutes * 60_000 && i.end > frame.awake.start - 6 * 3_600_000);

  const current =
    todays.find((i) => i.type !== "meal" && i.start <= now && now < i.end && i.status !== "done") ??
    todays.find((i) => i.type === "meal" && i.start <= now && now < i.end) ??
    null;
  const next = todays.find((i) => (i.type === "task" || i.type === "commitment") && i.start > now && i.status !== "done") ?? null;

  const taskBlocks = todays.filter((i) => i.type === "task" && localDateOf(i.start, tz) === today);
  const doneMinutes = taskBlocks.filter((i) => i.status === "done").reduce((s, i) => s + durationMin(i), 0);
  const plannedMinutes = taskBlocks.reduce((s, i) => s + durationMin(i), 0);
  const remainingToday = taskBlocks
    .filter((i) => i.status !== "done" && !i.taskCompleted && i.end > now)
    .reduce((s, i) => s + durationMin({ start: Math.max(i.start, now), end: i.end }), 0);

  const scheduledToday = new Map<string, number>();
  for (const b of taskBlocks) if (b.taskId) scheduledToday.set(b.taskId, (scheduledToday.get(b.taskId) ?? 0) + durationMin(b));

  const open = tasks.filter((t) => t.status !== "completed");
  const top = sortTasksForPlanning(open, now, frame.awake.end + 6 * 86_400_000)
    .slice(0, 3)
    .map((task) => ({ task, remaining: args.remainingByTask[task.id] ?? task.estimatedMinutes, scheduledToday: scheduledToday.get(task.id) ?? 0 }));

  // Free time = what's left of the waking day after commitments, meals and planned blocks.
  const window: Interval = { start: Math.max(now, frame.awake.start), end: frame.awake.end };
  const busy = todays.filter((i) => i.status !== "done" || i.end > now).map((i) => ({ start: i.blockStart, end: i.blockEnd }));
  const freeMinutes = window.end > window.start ? subtractIntervals(window, busy).reduce((s, i) => s + durationMin(i), 0) : 0;
  const commitmentsLeft = todays
    .filter((i) => i.type === "commitment")
    .reduce((s, i) => {
      const part = intersect({ start: i.start, end: i.end }, window);
      return s + (part ? durationMin(part) : 0);
    }, 0);

  const dayLoad = dayPreview.days.find((d) => d.date === today);
  const capacityMinutes = dayLoad?.capacityMinutes ?? 0;
  const dueToday = dayPreview.unscheduled.filter(
    (u) => u.reason !== "outside_horizon" && u.deadline !== null && localDateOf(u.deadline, tz) === today,
  );
  const atRiskToday = dayPreview.atRisk.filter((a) => localDateOf(a.deadline, tz) === today);

  // Work the planner would add today that isn't on the calendar yet.
  const plannedByPreview = new Map<string, number>();
  for (const s of dayPreview.sessions) if (s.taskId) plannedByPreview.set(s.taskId, (plannedByPreview.get(s.taskId) ?? 0) + durationMin(s));
  const unscheduledToday = Array.from(plannedByPreview.entries())
    .map(([taskId, minutes]) => ({ taskId, title: tasks.find((t) => t.id === taskId)?.title ?? "Task", minutes: minutes - (scheduledToday.get(taskId) ?? 0) }))
    .filter((x) => x.minutes > 0);

  let feasibility: Feasibility;
  let feasibilityText: string;
  if (open.length === 0 && plannedMinutes === 0) {
    feasibility = "empty";
    feasibilityText = "No open tasks. Add what's on your mind and Daywise will find time for it.";
  } else if (dueToday.length > 0 || (capacityMinutes > 0 && remainingToday > capacityMinutes * 1.05)) {
    feasibility = "overloaded";
    feasibilityText =
      dueToday.length > 0
        ? `${dueToday.map((u) => u.title).join(", ")} can't realistically be finished today. Let's look at options.`
        : "Today's plan is more than you can realistically do. Consider moving something.";
  } else if (unscheduledToday.length > 0 && remainingToday === 0) {
    feasibility = "needs_plan";
    feasibilityText = "You have tasks without time set aside. Plan your day to see what fits.";
  } else if (atRiskToday.length > 0 || (capacityMinutes > 0 && remainingToday >= capacityMinutes * 0.9)) {
    feasibility = "tight";
    feasibilityText = atRiskToday.length
      ? `Doable, but ${atRiskToday[0].title} is cutting it close.`
      : "Doable, but there's not much slack. Protect your breaks.";
  } else if (unscheduledToday.length > 0) {
    feasibility = "needs_plan";
    feasibilityText = "Some tasks could use time today. Plan your day to fit them in.";
  } else {
    feasibility = "on_track";
    feasibilityText = remainingToday > 0 ? "You're on track. What's planned fits comfortably." : "Nothing else planned today. Enjoy the space.";
  }

  return {
    current,
    next,
    top,
    progress: { doneMinutes, plannedMinutes, tasksCompletedToday: args.completedTodayCount },
    freeMinutes,
    workloadMinutes: remainingToday + commitmentsLeft,
    capacityMinutes,
    plannedTodayMinutes: remainingToday,
    feasibility,
    feasibilityText,
    missed: items.filter((i) => i.missed),
    unscheduledToday,
  };
}
