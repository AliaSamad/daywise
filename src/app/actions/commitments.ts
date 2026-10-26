"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/data/load";
import { fail, friendlyDbError, ok, type ActionResult } from "./result";
import { commitmentInput, firstIssue, uuid, type CommitmentInput } from "./schemas";

type Parsed = ReturnType<typeof commitmentInput.parse>;

function ruleRow(r: NonNullable<Parsed["recurrence"]>) {
  return {
    freq: r.freq,
    interval: r.interval,
    by_weekday: r.freq === "weekly" && r.byWeekday && r.byWeekday.length ? r.byWeekday : null,
    until_date: r.untilDate,
  };
}

function commitmentRow(c: Parsed) {
  return {
    title: c.title,
    kind: c.kind,
    location: c.location,
    start_date: c.startDate,
    start_time: c.startTime,
    end_time: c.endTime,
    travel_before_minutes: c.travelBeforeMinutes,
    travel_after_minutes: c.travelAfterMinutes,
    is_mandatory: c.isMandatory,
    notes: c.notes,
  };
}

async function saveRule(
  supabase: SupabaseClient,
  userId: string,
  existingId: string | null,
  rec: Parsed["recurrence"],
): Promise<{ id: string | null; error?: string }> {
  if (!rec) return { id: null };
  if (existingId) {
    const { error } = await supabase.from("recurrence_rules").update(ruleRow(rec)).eq("id", existingId);
    return error ? { id: null, error: error.message } : { id: existingId };
  }
  const { data, error } = await supabase
    .from("recurrence_rules")
    .insert({ ...ruleRow(rec), user_id: userId })
    .select("id")
    .single();
  return error ? { id: null, error: error.message } : { id: data.id as string };
}

export async function createCommitment(raw: CommitmentInput): Promise<ActionResult<{ id: string }>> {
  const parsed = commitmentInput.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { supabase, user, tz } = await requireUser();
  const rule = await saveRule(supabase, user.id, null, parsed.data.recurrence);
  if (rule.error) return fail(friendlyDbError(rule.error));
  const { data, error } = await supabase
    .from("commitments")
    .insert({ ...commitmentRow(parsed.data), user_id: user.id, timezone: tz, recurrence_rule_id: rule.id })
    .select("id")
    .single();
  if (error) {
    if (rule.id) await supabase.from("recurrence_rules").delete().eq("id", rule.id);
    return fail(friendlyDbError(error.message));
  }
  revalidatePath("/", "layout");
  return ok({ id: data.id as string });
}

export async function updateCommitment(id: string, raw: CommitmentInput): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown commitment.");
  const parsed = commitmentInput.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { supabase, user } = await requireUser();
  const { data: current, error: cErr } = await supabase
    .from("commitments")
    .select("id,recurrence_rule_id")
    .eq("id", id)
    .maybeSingle();
  if (cErr) return fail(friendlyDbError(cErr.message));
  if (!current) return fail("That commitment no longer exists.");

  const oldRule = current.recurrence_rule_id as string | null;
  const rule = await saveRule(supabase, user.id, oldRule, parsed.data.recurrence);
  if (rule.error) return fail(friendlyDbError(rule.error));
  const { error } = await supabase
    .from("commitments")
    .update({ ...commitmentRow(parsed.data), recurrence_rule_id: rule.id })
    .eq("id", id);
  if (error) return fail(friendlyDbError(error.message));
  if (oldRule && !rule.id) await supabase.from("recurrence_rules").delete().eq("id", oldRule);
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function deleteCommitment(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown commitment.");
  const { supabase } = await requireUser();
  const { data: current } = await supabase.from("commitments").select("recurrence_rule_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("commitments").delete().eq("id", id);
  if (error) return fail(friendlyDbError(error.message));
  if (current?.recurrence_rule_id) await supabase.from("recurrence_rules").delete().eq("id", current.recurrence_rule_id);
  revalidatePath("/", "layout");
  return ok(undefined);
}

/** Cancel (or restore) a single occurrence of a recurring commitment. */
export async function setOccurrenceSkipped(commitmentId: string, date: string, skipped: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(commitmentId).success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Unknown occurrence.");
  const { supabase, user } = await requireUser();
  const { error } = skipped
    ? await supabase
        .from("commitment_exceptions")
        .upsert({ commitment_id: commitmentId, user_id: user.id, occurrence_date: date }, { onConflict: "commitment_id,occurrence_date" })
    : await supabase.from("commitment_exceptions").delete().eq("commitment_id", commitmentId).eq("occurrence_date", date);
  if (error) return fail(friendlyDbError(error.message));
  revalidatePath("/", "layout");
  return ok(undefined);
}
