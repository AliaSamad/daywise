"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, friendlyDbError, ok, type ActionResult } from "./result";
import { firstIssue, preferencesInput, type PreferencesInput } from "./schemas";

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function savePreferences(raw: PreferencesInput, completeOnboarding: boolean): Promise<ActionResult> {
  const parsed = preferencesInput.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const p = parsed.data;
  if (!isValidTimezone(p.timezone)) return fail("Please choose a valid time zone.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session has expired. Please log in again.");

  const profile: Record<string, unknown> = {
    id: user.id,
    display_name: p.displayName,
    user_type: p.userType,
    timezone: p.timezone,
  };
  if (completeOnboarding) profile.onboarded_at = new Date().toISOString();

  const { error: pErr } = await supabase.from("profiles").upsert(profile, { onConflict: "id" });
  if (pErr) return fail(friendlyDbError(pErr.message));

  const { error } = await supabase.from("scheduling_preferences").upsert(
    {
      user_id: user.id,
      wake_time: p.wakeTime,
      bed_time: p.bedTime,
      work_start: p.workStart,
      work_end: p.workEnd,
      breakfast_time: p.breakfastTime,
      lunch_time: p.lunchTime,
      dinner_time: p.dinnerTime,
      meal_minutes: p.mealMinutes,
      break_minutes: p.breakMinutes,
      focus_preference: p.focusPreference,
      max_focus_minutes: p.maxFocusMinutes,
      session_minutes: p.sessionMinutes,
      weekend_mode: p.weekendMode,
      buffer_percent: p.bufferPercent,
      wind_down_minutes: p.windDownMinutes,
    },
    { onConflict: "user_id" },
  );
  if (error) return fail(friendlyDbError(error.message));
  revalidatePath("/", "layout");
  return ok(undefined);
}
