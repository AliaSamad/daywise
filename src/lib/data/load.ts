import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { addDaysLocal, zonedInstant, type LocalDate } from "@/lib/scheduler/time";
import { expandCommitments } from "@/lib/scheduler/recurrence";
import type { Commitment, CommitmentOccurrence, SchedulingPrefs } from "@/lib/scheduler/types";
import {
  COMMITMENT_SELECT,
  PREFS_SELECT,
  SESSION_SELECT,
  TASK_SELECT,
  type CommitmentRow,
  type PrefsRow,
  type ProfileRow,
  type SessionRow,
  type TaskRow,
} from "./rows";
import { completedMinutesByTask, toCommitment, toPrefs } from "./mappers";

export interface UserContext {
  supabase: SupabaseClient;
  user: User;
  profile: ProfileRow;
  prefsRow: PrefsRow;
  prefs: SchedulingPrefs;
  tz: string;
}

/** Signed-in user with profile and preferences. Redirects when signed out or not onboarded. */
export const requireUser = cache(async (allowNotOnboarded: boolean = false): Promise<UserContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error: pErr }, { data: prefsRow, error: prErr }] = await Promise.all([
    supabase.from("profiles").select("id,display_name,user_type,timezone,onboarded_at").eq("id", user.id).maybeSingle(),
    supabase.from("scheduling_preferences").select(PREFS_SELECT).eq("user_id", user.id).maybeSingle(),
  ]);
  if (pErr || prErr) throw new Error(`Could not load your profile: ${(pErr ?? prErr)!.message}`);
  if (!profile || !prefsRow) {
    // The signup trigger should have created these; recover gracefully if it didn't.
    await supabase.from("profiles").upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });
    await supabase.from("scheduling_preferences").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
    redirect("/onboarding");
  }
  const p = profile as ProfileRow;
  if (!p.onboarded_at && !allowNotOnboarded) redirect("/onboarding");
  const pr = prefsRow as PrefsRow;
  return { supabase, user, profile: p, prefsRow: pr, prefs: toPrefs(pr), tz: p.timezone || "UTC" };
});

export interface Workspace {
  commitmentRows: CommitmentRow[];
  commitments: Commitment[];
  occurrences: CommitmentOccurrence[];
  tasks: TaskRow[];
  sessions: SessionRow[];
  completedMinutes: Record<string, number>;
}

/**
 * Everything needed to render or plan the local dates [from, to]: all commitments (expanded),
 * every task that is open or was completed recently, and sessions overlapping the range.
 */
export async function loadWorkspace(ctx: UserContext, from: LocalDate, to: LocalDate): Promise<Workspace> {
  const { supabase, tz } = ctx;
  const rangeStart = new Date(zonedInstant(addDaysLocal(from, -1), "00:00", tz)).toISOString();
  const rangeEnd = new Date(zonedInstant(addDaysLocal(to, 2), "00:00", tz)).toISOString();
  const recentCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [c, t, s] = await Promise.all([
    supabase.from("commitments").select(COMMITMENT_SELECT).order("start_time"),
    supabase
      .from("tasks")
      .select(TASK_SELECT)
      .or(`status.neq.completed,completed_at.gte.${recentCutoff}`)
      .order("deadline", { ascending: true, nullsFirst: false }),
    supabase
      .from("scheduled_sessions")
      .select(SESSION_SELECT)
      .lt("start_at", rangeEnd)
      .gt("end_at", rangeStart)
      .order("start_at"),
  ]);
  const err = c.error ?? t.error ?? s.error;
  if (err) throw new Error(`Could not load your schedule: ${err.message}`);

  const commitmentRows = (c.data ?? []) as unknown as CommitmentRow[];
  const commitments = commitmentRows.map(toCommitment);
  const tasks = (t.data ?? []) as TaskRow[];

  // Progress counts every finished session for open tasks, not just ones in this range.
  const openIds = tasks.filter((x) => x.status !== "completed").map((x) => x.id);
  let completedMinutes: Record<string, number> = {};
  if (openIds.length) {
    const { data: done, error } = await supabase
      .from("scheduled_sessions")
      .select(SESSION_SELECT)
      .eq("status", "done")
      .in("task_id", openIds);
    if (error) throw new Error(`Could not load progress: ${error.message}`);
    completedMinutes = completedMinutesByTask((done ?? []) as SessionRow[]);
  }

  return {
    commitmentRows,
    commitments,
    occurrences: expandCommitments(commitments, from, to),
    tasks,
    sessions: (s.data ?? []) as SessionRow[],
    completedMinutes,
  };
}
