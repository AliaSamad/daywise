"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/data/load";
import { zonedInstant } from "@/lib/scheduler/time";
import { fail, friendlyDbError, ok, type ActionResult } from "./result";
import { firstIssue, taskInput, taskStatus, uuid, type TaskInput } from "./schemas";

function toRow(input: ReturnType<typeof taskInput.parse>, tz: string) {
  return {
    title: input.title,
    description: input.description,
    estimated_minutes: input.estimatedMinutes,
    deadline: input.deadlineDate
      ? new Date(zonedInstant(input.deadlineDate, input.deadlineTime ?? "23:59", tz)).toISOString()
      : null,
    priority: input.priority,
    category: input.category,
    custom_category: input.category === "custom" ? input.customCategory : null,
    splittable: input.splittable,
    min_session_minutes: Math.min(input.minSessionMinutes, input.estimatedMinutes),
    earliest_start: input.earliestStart,
    preferred_time: input.preferredTime,
  };
}

export async function createTasks(inputs: TaskInput[]): Promise<ActionResult<{ ids: string[] }>> {
  if (!Array.isArray(inputs) || inputs.length === 0) return fail("Add at least one task.");
  if (inputs.length > 50) return fail("That's a lot at once — please add up to 50 tasks.");
  const { supabase, user, tz } = await requireUser();
  const rows = [];
  for (const raw of inputs) {
    const parsed = taskInput.safeParse(raw);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    rows.push({ ...toRow(parsed.data, tz), user_id: user.id });
  }
  const { data, error } = await supabase.from("tasks").insert(rows).select("id");
  if (error) return fail(friendlyDbError(error.message));
  revalidatePath("/", "layout");
  return ok({ ids: (data ?? []).map((r) => r.id as string) });
}

export async function updateTask(id: string, raw: TaskInput): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown task.");
  const parsed = taskInput.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { supabase, tz } = await requireUser();
  const { error } = await supabase.from("tasks").update(toRow(parsed.data, tz)).eq("id", id);
  if (error) return fail(friendlyDbError(error.message));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function deleteTask(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown task.");
  const { supabase } = await requireUser();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return fail(friendlyDbError(error.message));
  revalidatePath("/", "layout");
  return ok(undefined);
}

/**
 * Change a task's status. Completing a task optionally records how long it really took
 * (Reality Mode data) and clears its future planned sessions so that time frees up.
 */
export async function setTaskStatus(
  id: string,
  status: string,
  actualMinutes?: number | null,
): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown task.");
  const s = taskStatus.safeParse(status);
  if (!s.success) return fail("Unknown status.");
  if (actualMinutes != null && (!Number.isInteger(actualMinutes) || actualMinutes < 1 || actualMinutes > 1440)) {
    return fail("Actual time should be between 1 minute and 24 hours.");
  }
  const { supabase, user } = await requireUser();
  const { data: task, error: tErr } = await supabase
    .from("tasks")
    .select("id,estimated_minutes,category")
    .eq("id", id)
    .maybeSingle();
  if (tErr) return fail(friendlyDbError(tErr.message));
  if (!task) return fail("That task no longer exists.");

  const completed = s.data === "completed";
  const { error } = await supabase
    .from("tasks")
    .update({ status: s.data, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return fail(friendlyDbError(error.message));

  if (completed) {
    if (actualMinutes) {
      const { error: teErr } = await supabase.from("time_entries").insert({
        user_id: user.id,
        task_id: id,
        minutes: actualMinutes,
        estimated_minutes: task.estimated_minutes,
        category: task.category,
        source: "manual",
      });
      if (teErr) return fail(friendlyDbError(teErr.message));
    }
    const { error: sErr } = await supabase
      .from("scheduled_sessions")
      .delete()
      .eq("task_id", id)
      .eq("status", "planned")
      .gt("start_at", new Date().toISOString());
    if (sErr) return fail(friendlyDbError(sErr.message));
  }
  revalidatePath("/", "layout");
  return ok(undefined);
}
