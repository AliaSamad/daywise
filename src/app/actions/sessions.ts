"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadWorkspace, requireUser } from "@/lib/data/load";
import { validateSessionMove } from "@/lib/scheduler/conflicts";
import { addDaysLocal, localDateOf, overlaps } from "@/lib/scheduler/time";
import type { SessionRow } from "@/lib/data/rows";
import { fail, friendlyDbError, ok, type ActionResult } from "./result";
import { uuid } from "./schemas";

const moveInput = z.object({
  id: uuid,
  start: z.number().int(),
  end: z.number().int(),
  /** The user has seen the soft warnings and wants to go ahead. */
  confirmed: z.boolean(),
});

/**
 * Move a flexible task block. Hard conflicts (overlaps with commitments or other tasks,
 * sleep time, the past) are rejected; soft ones need confirmation. Moved blocks are locked
 * so future planning keeps them where the user put them.
 */
export async function moveSession(
  raw: z.input<typeof moveInput>,
): Promise<ActionResult<{ warnings: string[]; needsConfirmation: boolean }>> {
  const parsed = moveInput.safeParse(raw);
  if (!parsed.success) return fail("Invalid move.");
  const { id, start, end, confirmed } = parsed.data;
  const ctx = await requireUser();
  const { supabase, tz, prefs } = ctx;

  const { data: row, error } = await supabase
    .from("scheduled_sessions")
    .select("id,task_id,kind,start_at,end_at,status,locked,tasks(title,deadline)")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(friendlyDbError(error.message));
  if (!row) return fail("That block no longer exists.");
  if (row.kind !== "task") return fail("Only task blocks can be moved.");

  const date = localDateOf(start, tz);
  const ws = await loadWorkspace(ctx, addDaysLocal(date, -1), addDaysLocal(date, 1));
  const task = (Array.isArray(row.tasks) ? row.tasks[0] : row.tasks) as { title: string; deadline: string | null } | null;
  const titleById = new Map(ws.tasks.map((t) => [t.id, t.title]));
  const others = ws.sessions
    .filter((s) => s.status !== "skipped" && s.id !== id)
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.kind === "task" ? titleById.get(s.task_id ?? "") ?? "another task" : "Break",
      start: Date.parse(s.start_at),
      end: Date.parse(s.end_at),
    }));

  const check = validateSessionMove({
    move: { sessionId: id, taskTitle: task?.title ?? "this task", start, end, deadline: task?.deadline ? Date.parse(task.deadline) : null },
    now: Date.now(),
    tz,
    prefs,
    occurrences: ws.occurrences,
    sessions: others,
  });
  if (check.errors.length) return fail(check.errors.join(" "));
  if (check.warnings.length && !confirmed) return ok({ warnings: check.warnings, needsConfirmation: true });

  // A moved block replaces any planned break it lands on.
  const breaks = (ws.sessions as SessionRow[]).filter(
    (s) => s.kind === "break" && s.status === "planned" && overlaps({ start, end }, { start: Date.parse(s.start_at), end: Date.parse(s.end_at) }),
  );
  if (breaks.length) {
    const { error: bErr } = await supabase.from("scheduled_sessions").delete().in("id", breaks.map((b) => b.id));
    if (bErr) return fail(friendlyDbError(bErr.message));
  }

  const { error: uErr } = await supabase
    .from("scheduled_sessions")
    .update({ start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), locked: true, status: "planned" })
    .eq("id", id);
  if (uErr) return fail(friendlyDbError(uErr.message));
  revalidatePath("/", "layout");
  return ok({ warnings: check.warnings, needsConfirmation: false });
}

export async function setSessionStatus(id: string, status: "planned" | "done" | "skipped"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !["planned", "done", "skipped"].includes(status)) return fail("Invalid request.");
  const { supabase } = await requireUser();
  const { data: row, error } = await supabase
    .from("scheduled_sessions")
    .update({ status })
    .eq("id", id)
    .select("task_id")
    .maybeSingle();
  if (error) return fail(friendlyDbError(error.message));
  if (!row) return fail("That block no longer exists.");
  if (status === "done" && row.task_id) {
    await supabase.from("tasks").update({ status: "in_progress" }).eq("id", row.task_id).eq("status", "not_started");
  }
  revalidatePath("/", "layout");
  return ok(undefined);
}

/** Let the planner move a block again. */
export async function unlockSession(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const { supabase } = await requireUser();
  const { error } = await supabase.from("scheduled_sessions").update({ locked: false }).eq("id", id);
  if (error) return fail(friendlyDbError(error.message));
  revalidatePath("/", "layout");
  return ok(undefined);
}

/** Remove a planned block from the calendar. The task itself is untouched. */
export async function removeSession(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const { supabase } = await requireUser();
  const { error } = await supabase.from("scheduled_sessions").delete().eq("id", id).neq("status", "done");
  if (error) return fail(friendlyDbError(error.message));
  revalidatePath("/", "layout");
  return ok(undefined);
}
