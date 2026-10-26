"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadWorkspace, requireUser } from "@/lib/data/load";
import { buildPlanPreview, planWindow, type PlanOptions, type PlanPreview } from "@/lib/planner/preview";
import { addDaysLocal } from "@/lib/scheduler/time";
import { fail, friendlyDbError, ok, type ActionResult } from "./result";
import { uuid } from "./schemas";

const optionsSchema = z.object({
  scope: z.enum(["day", "week", "replan"]),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  delayMinutes: z.number().int().min(0).max(720).optional(),
  extraTime: z.object({ taskId: uuid, minutes: z.number().int().min(5).max(600) }).optional(),
});

/** Compute a plan without saving anything, so the user can review it first. */
export async function previewPlan(raw: PlanOptions): Promise<ActionResult<PlanPreview>> {
  const parsed = optionsSchema.safeParse(raw);
  if (!parsed.success) return fail("Invalid planning request.");
  try {
    const ctx = await requireUser();
    const now = Date.now();
    const win = planWindow(parsed.data, now, ctx.tz, ctx.prefs);
    const ws = await loadWorkspace(ctx, win.horizon[0], addDaysLocal(win.horizon[win.horizon.length - 1], 1));
    return ok(buildPlanPreview({ opts: parsed.data, now, tz: ctx.tz, prefs: ctx.prefs, ws }));
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // let Next.js redirects through
    return fail(e instanceof Error ? e.message : "Could not build a plan.");
  }
}

const applySchema = z.object({
  rangeStart: z.number().int(),
  rangeEnd: z.number().int(),
  sessions: z
    .array(
      z.object({
        taskId: uuid.nullable(),
        kind: z.enum(["task", "break"]),
        start: z.number().int(),
        end: z.number().int(),
      }),
    )
    .max(400),
  extraTime: z.object({ taskId: uuid, minutes: z.number().int().min(5).max(600) }).nullable(),
  summary: z.object({
    scope: z.enum(["day", "week", "replan"]),
    feasible: z.boolean(),
    headline: z.string().max(300),
    unscheduled: z.number().int(),
    atRisk: z.number().int(),
  }),
});

/** Save an approved plan. Locked, finished and already-started blocks are never touched. */
export async function applyPlan(raw: z.input<typeof applySchema>): Promise<ActionResult<{ planId: string }>> {
  const parsed = applySchema.safeParse(raw);
  if (!parsed.success) return fail("Invalid plan.");
  const p = parsed.data;
  if (p.sessions.some((s) => s.end <= s.start || s.start < p.rangeStart || s.start >= p.rangeEnd)) {
    return fail("That plan doesn't match its time range. Please plan again.");
  }
  if (p.sessions.some((s) => (s.kind === "task") !== (s.taskId !== null))) return fail("Invalid plan.");
  const { supabase } = await requireUser();

  if (p.extraTime) {
    const { data: t, error } = await supabase.from("tasks").select("estimated_minutes").eq("id", p.extraTime.taskId).maybeSingle();
    if (error || !t) return fail("That task no longer exists.");
    const { error: uErr } = await supabase
      .from("tasks")
      .update({ estimated_minutes: Math.min(6000, (t.estimated_minutes as number) + p.extraTime.minutes), status: "in_progress" })
      .eq("id", p.extraTime.taskId);
    if (uErr) return fail(friendlyDbError(uErr.message));
  }

  const { data, error } = await supabase.rpc("apply_plan", {
    p_range_start: new Date(p.rangeStart).toISOString(),
    p_range_end: new Date(p.rangeEnd).toISOString(),
    p_sessions: p.sessions.map((s) => ({
      task_id: s.taskId,
      kind: s.kind,
      start_at: new Date(s.start).toISOString(),
      end_at: new Date(s.end).toISOString(),
    })),
    p_summary: p.summary,
  });
  if (error) return fail(friendlyDbError(error.message));
  revalidatePath("/", "layout");
  return ok({ planId: data as string });
}
