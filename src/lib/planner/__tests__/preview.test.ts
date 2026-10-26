import { describe, expect, it } from "vitest";
import { buildPlanPreview, planWindow } from "../preview";
import type { Workspace } from "@/lib/data/load";
import type { SessionRow, TaskRow } from "@/lib/data/rows";
import { durationMin, localDateOf } from "@/lib/scheduler/time";
import { at, MONDAY, prefs, TZ } from "@/lib/scheduler/__tests__/fixtures";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function taskRow(n: number, over: Partial<TaskRow>): TaskRow {
  return {
    id: id(n),
    title: `Task ${n}`,
    description: null,
    estimated_minutes: 60,
    deadline: null,
    priority: "medium",
    category: "study",
    custom_category: null,
    splittable: true,
    min_session_minutes: 25,
    earliest_start: null,
    preferred_time: null,
    status: "not_started",
    completed_at: null,
    is_demo: false,
    created_at: new Date(0).toISOString(),
    ...over,
  };
}

function session(n: number, taskN: number, start: number, end: number, over: Partial<SessionRow> = {}): SessionRow {
  return { id: id(100 + n), task_id: id(taskN), kind: "task", start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), status: "planned", locked: false, ...over };
}

function ws(tasks: TaskRow[], sessions: SessionRow[] = []): Workspace {
  return { commitmentRows: [], commitments: [], occurrences: [], tasks, sessions, completedMinutes: {} };
}

describe("buildPlanPreview", () => {
  const essay = taskRow(1, { title: "Essay", estimated_minutes: 300, deadline: new Date(at("2026-10-30", "17:00")).toISOString() });

  it("Plan my day only applies today's blocks and reports the rest as deferred", () => {
    const p = buildPlanPreview({ opts: { scope: "day" }, now: at(MONDAY, "08:00"), tz: TZ, prefs, ws: ws([essay]) });
    expect(p.sessions.length).toBeGreaterThan(0);
    for (const s of p.sessions) expect(localDateOf(s.start, TZ)).toBe(MONDAY);
    const today = p.sessions.filter((s) => s.kind === "task").reduce((a, s) => a + durationMin(s), 0);
    expect(today).toBeLessThan(300);
    expect(p.deferred.find((d) => d.title === "Essay")?.minutes).toBe(300 - today);
  });

  it("Plan my week starts from today when run mid-week and refuses past weeks", () => {
    const wed = at("2026-10-28", "08:00");
    const win = planWindow({ scope: "week", weekStart: MONDAY }, wed, TZ, prefs);
    expect(win.horizon[0]).toBe("2026-10-28");
    expect(win.horizon).toHaveLength(5);
    expect(() => planWindow({ scope: "week", weekStart: "2026-10-19" }, wed, TZ, prefs)).toThrow(/over/);
  });

  it("replaces planner-owned blocks but keeps locked and finished ones", () => {
    const sessions = [
      session(1, 1, at(MONDAY, "09:00"), at(MONDAY, "09:50")), // planner-owned, future
      session(2, 1, at(MONDAY, "10:00"), at(MONDAY, "10:50"), { locked: true }),
      session(3, 1, at(MONDAY, "11:00"), at(MONDAY, "11:30"), { status: "done" }),
    ];
    const p = buildPlanPreview({ opts: { scope: "week" }, now: at(MONDAY, "08:00"), tz: TZ, prefs, ws: { ...ws([essay], sessions), completedMinutes: { [id(1)]: 30 } } });
    expect(p.removedCount).toBe(1);
    const planned = p.sessions.filter((s) => s.kind === "task").reduce((a, s) => a + durationMin(s), 0);
    expect(planned).toBe(300 - 30 - 50);
  });

  it("Replan honours a 'running late' delay and shows work moving to later days", () => {
    const sessions = [
      session(1, 1, at(MONDAY, "09:00"), at(MONDAY, "09:50")),
      session(2, 1, at(MONDAY, "10:00"), at(MONDAY, "10:50")),
      session(3, 1, at(MONDAY, "11:00"), at(MONDAY, "11:50")),
    ];
    const now = at(MONDAY, "08:55");
    const p = buildPlanPreview({ opts: { scope: "replan", delayMinutes: 120 }, now, tz: TZ, prefs, ws: ws([essay], sessions) });
    for (const s of p.sessions) expect(s.start).toBeGreaterThanOrEqual(now + 120 * 60_000);
    expect(p.removedCount).toBe(3);
    expect(p.changes[0].title).toBe("Essay");
  });

  it("Replan with extra time adds to the task's remaining work", () => {
    const small = taskRow(2, { title: "Lab", estimated_minutes: 60 });
    const base = buildPlanPreview({ opts: { scope: "replan" }, now: at(MONDAY, "08:00"), tz: TZ, prefs, ws: ws([small]) });
    const more = buildPlanPreview({ opts: { scope: "replan", extraTime: { taskId: id(2), minutes: 45 } }, now: at(MONDAY, "08:00"), tz: TZ, prefs, ws: ws([small]) });
    const sum = (x: typeof base) => x.sessions.filter((s) => s.kind === "task").reduce((a, s) => a + durationMin(s), 0);
    expect(sum(more) - sum(base)).toBe(45);
    expect(more.extraTime).toEqual({ taskId: id(2), minutes: 45 });
  });

  it("missed blocks are counted and their work is rescheduled, never dropped", () => {
    const sessions = [session(1, 1, at(MONDAY, "09:00"), at(MONDAY, "10:00"))];
    const p = buildPlanPreview({ opts: { scope: "replan" }, now: at(MONDAY, "12:00"), tz: TZ, prefs, ws: ws([essay], sessions) });
    expect(p.missedCount).toBe(1);
    expect(p.sessions.filter((s) => s.kind === "task").reduce((a, s) => a + durationMin(s), 0)).toBe(300);
  });
});
