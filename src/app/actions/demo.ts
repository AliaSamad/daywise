"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/data/load";
import { buildDemoData } from "@/lib/demo/demo-data";
import { localDateOf } from "@/lib/scheduler/time";
import { fail, friendlyDbError, ok, type ActionResult } from "./result";

export async function loadDemoData(): Promise<ActionResult> {
  const { supabase, user, tz } = await requireUser(true);
  const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("is_demo", true);
  if ((count ?? 0) > 0) return fail("Sample data is already loaded.");

  const { commitments, tasks } = buildDemoData(localDateOf(Date.now(), tz), tz);
  for (const { rule, ...c } of commitments) {
    let ruleId: string | null = null;
    if (rule) {
      const { data, error } = await supabase.from("recurrence_rules").insert({ ...rule, user_id: user.id }).select("id").single();
      if (error) return fail(friendlyDbError(error.message));
      ruleId = data.id as string;
    }
    const { error } = await supabase
      .from("commitments")
      .insert({ ...c, user_id: user.id, timezone: tz, recurrence_rule_id: ruleId, is_demo: true });
    if (error) return fail(friendlyDbError(error.message));
  }
  const { error } = await supabase.from("tasks").insert(tasks.map((t) => ({ ...t, user_id: user.id, is_demo: true })));
  if (error) return fail(friendlyDbError(error.message));
  revalidatePath("/", "layout");
  return ok(undefined);
}

/** Remove every sample row. User-created data is never touched. */
export async function clearDemoData(): Promise<ActionResult> {
  const { supabase } = await requireUser(true);
  const { data: demo } = await supabase.from("commitments").select("recurrence_rule_id").eq("is_demo", true);
  const ruleIds = (demo ?? []).map((d) => d.recurrence_rule_id as string | null).filter((x): x is string => !!x);
  const results = await Promise.all([
    supabase.from("tasks").delete().eq("is_demo", true),
    supabase.from("commitments").delete().eq("is_demo", true),
  ]);
  const err = results.find((r) => r.error)?.error;
  if (err) return fail(friendlyDbError(err.message));
  if (ruleIds.length) await supabase.from("recurrence_rules").delete().in("id", ruleIds);
  revalidatePath("/", "layout");
  return ok(undefined);
}
