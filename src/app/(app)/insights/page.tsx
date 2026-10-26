import { loadWorkspace, requireUser } from "@/lib/data/load";
import { planSchedule, isMissedSession } from "@/lib/scheduler/engine";
import { addDaysLocal, dateRange, localDateOf, startOfWeekLocal, zonedInstant } from "@/lib/scheduler/time";
import { toSession } from "@/lib/data/mappers";
import { categoryAccuracy, type EntryLike } from "@/lib/reality";
import { TASK_SELECT, type TaskRow } from "@/lib/data/rows";
import { InsightsView } from "@/components/insights/insights-view";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const ctx = await requireUser();
  const { supabase, tz, prefs } = ctx;
  const now = Date.now();
  const today = localDateOf(now, tz);
  const weekStart = startOfWeekLocal(today);
  const days = dateRange(weekStart, 7);
  const since30 = new Date(now - 30 * 86_400_000).toISOString();

  const [ws, entriesRes, completedRes] = await Promise.all([
    loadWorkspace(ctx, weekStart, addDaysLocal(weekStart, 6)),
    supabase.from("time_entries").select("minutes,estimated_minutes,category").order("created_at", { ascending: false }).limit(500),
    supabase.from("tasks").select(TASK_SELECT).eq("status", "completed").gte("completed_at", since30),
  ]);
  if (entriesRes.error || completedRes.error) throw new Error((entriesRes.error ?? completedRes.error)!.message);

  // Capacity is measured from the start of each day so past days count too.
  const loads = days.map((d) => {
    const [load] = planSchedule({
      now: Math.min(now, zonedInstant(d, "00:00", tz)),
      timezone: tz,
      days: [d],
      prefs,
      tasks: [],
      occurrences: ws.occurrences,
      existingSessions: ws.sessions.map(toSession).map((s) => ({ ...s, locked: true })),
    }).days;
    return load;
  });

  const sessions = ws.sessions.map(toSession);
  const missedThisWeek = sessions.filter((s) => isMissedSession(s, now) && localDateOf(s.start, tz) >= weekStart).length;
  const doneThisWeek = sessions.filter((s) => s.kind === "task" && s.status === "done").length;

  const completed = (completedRes.data ?? []) as TaskRow[];
  const open = ws.tasks.filter((t) => t.status !== "completed");

  return (
    <InsightsView
      loads={loads}
      today={today}
      missedThisWeek={missedThisWeek}
      doneThisWeek={doneThisWeek}
      completed={completed.map((t) => ({ category: t.category, completedAt: Date.parse(t.completed_at!) }))}
      open={open.map((t) => ({ category: t.category, minutes: Math.max(0, t.estimated_minutes - (ws.completedMinutes[t.id] ?? 0)) }))}
      accuracy={categoryAccuracy((entriesRes.data ?? []) as EntryLike[])}
      now={now}
    />
  );
}
