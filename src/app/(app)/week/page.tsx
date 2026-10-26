import { loadWorkspace, requireUser } from "@/lib/data/load";
import { buildCalendarItems } from "@/lib/calendar/items";
import { planSchedule } from "@/lib/scheduler/engine";
import { addDaysLocal, dateRange, daysBetween, localDateOf, startOfWeekLocal } from "@/lib/scheduler/time";
import { conflictingOccurrenceKeys, findCommitmentConflicts } from "@/lib/scheduler/conflicts";
import { toSession } from "@/lib/data/mappers";
import { WeekView } from "@/components/calendar/week-view";

export const metadata = { title: "Week" };
export const dynamic = "force-dynamic";

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const ctx = await requireUser();
  const { tz, prefs } = ctx;
  const now = Date.now();
  const today = localDateOf(now, tz);
  const { week } = await searchParams;
  const weekStart = startOfWeekLocal(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const days = dateRange(weekStart, 7);
  const ws = await loadWorkspace(ctx, weekStart, addDaysLocal(weekStart, 6));

  const items = buildCalendarItems({ days, prefs, tz, occurrences: ws.occurrences, sessions: ws.sessions, tasks: ws.tasks, now });

  // Current load per day, treating what's on the calendar as fixed.
  const loads = planSchedule({
    now,
    timezone: tz,
    days,
    prefs,
    tasks: [],
    occurrences: ws.occurrences,
    existingSessions: ws.sessions.map(toSession).map((s) => ({ ...s, locked: true })),
  }).days;

  const conflicts = conflictingOccurrenceKeys(findCommitmentConflicts(ws.occurrences)).size / 2;

  return (
    <WeekView
      weekStart={weekStart}
      days={days}
      items={items}
      now={now}
      loads={loads}
      conflicts={Math.ceil(conflicts)}
      canPlan={daysBetween(today, addDaysLocal(weekStart, 6)) >= 0}
      isCurrentWeek={weekStart === startOfWeekLocal(today)}
      tasks={ws.tasks.filter((t) => t.status !== "completed").map((t) => ({ id: t.id, title: t.title, estimatedMinutes: t.estimated_minutes }))}
    />
  );
}
