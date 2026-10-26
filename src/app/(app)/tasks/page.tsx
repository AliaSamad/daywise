import { requireUser } from "@/lib/data/load";
import { SESSION_SELECT, TASK_SELECT, type SessionRow, type TaskRow } from "@/lib/data/rows";
import { completedMinutesByTask } from "@/lib/data/mappers";
import { TaskList } from "@/components/tasks/task-list";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { supabase } = await requireUser();
  const { edit } = await searchParams;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: tasks, error }, { data: sessions, error: sErr }] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).or(`status.neq.completed,completed_at.gte.${since}`).order("created_at", { ascending: false }),
    supabase.from("scheduled_sessions").select(SESSION_SELECT).eq("kind", "task").neq("status", "skipped"),
  ]);
  if (error || sErr) throw new Error((error ?? sErr)!.message);

  const now = Date.now();
  const rows = (sessions ?? []) as SessionRow[];
  const done = completedMinutesByTask(rows);
  const upcoming: Record<string, number> = {};
  const missed: Record<string, number> = {};
  for (const s of rows) {
    if (!s.task_id || s.status !== "planned") continue;
    const mins = Math.round((Date.parse(s.end_at) - Date.parse(s.start_at)) / 60_000);
    if (Date.parse(s.end_at) > now) upcoming[s.task_id] = (upcoming[s.task_id] ?? 0) + mins;
    else missed[s.task_id] = (missed[s.task_id] ?? 0) + 1;
  }

  return <TaskList tasks={(tasks ?? []) as TaskRow[]} done={done} upcoming={upcoming} missed={missed} editId={edit ?? null} now={now} />;
}
