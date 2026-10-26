import { loadWorkspace, requireUser } from "@/lib/data/load";
import { buildCalendarItems } from "@/lib/calendar/items";
import { buildPlanPreview } from "@/lib/planner/preview";
import { buildDashboard } from "@/lib/dashboard";
import { addDaysLocal, localDateOf } from "@/lib/scheduler/time";
import { toTask } from "@/lib/data/mappers";
import { Dashboard } from "@/components/dashboard/dashboard";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const ctx = await requireUser();
  const { tz, prefs, profile } = ctx;
  const now = Date.now();
  const today = localDateOf(now, tz);
  const ws = await loadWorkspace(ctx, today, addDaysLocal(today, 7));

  const items = buildCalendarItems({
    days: [today],
    prefs,
    tz,
    occurrences: ws.occurrences.filter((o) => o.date === today || o.date === addDaysLocal(today, -1)),
    sessions: ws.sessions,
    tasks: ws.tasks,
    now,
  });
  const dayPreview = buildPlanPreview({ opts: { scope: "day" }, now, tz, prefs, ws });
  const tasks = ws.tasks.map(toTask);

  const plannedFuture: Record<string, number> = {};
  for (const s of ws.sessions) {
    if (s.kind === "task" && s.task_id && s.status === "planned" && Date.parse(s.end_at) > now) {
      plannedFuture[s.task_id] = (plannedFuture[s.task_id] ?? 0) + Math.round((Date.parse(s.end_at) - Date.parse(s.start_at)) / 60_000);
    }
  }
  const remainingByTask: Record<string, number> = {};
  for (const t of tasks) remainingByTask[t.id] = Math.max(0, t.estimatedMinutes - (ws.completedMinutes[t.id] ?? 0));

  const completedTodayCount = ws.tasks.filter((t) => t.completed_at && localDateOf(Date.parse(t.completed_at), tz) === today).length;
  const summary = buildDashboard({ now, tz, today, prefs, items, tasks, completedTodayCount, remainingByTask, dayPreview });

  return (
    <Dashboard
      name={profile.display_name}
      now={now}
      today={today}
      items={items}
      summary={summary}
      tasks={ws.tasks.filter((t) => t.status !== "completed").map((t) => ({ id: t.id, title: t.title, estimatedMinutes: t.estimated_minutes }))}
      plannedFuture={plannedFuture}
      isEmpty={ws.tasks.length === 0 && ws.commitments.length === 0}
    />
  );
}
