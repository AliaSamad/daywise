import { describe, expect, it } from "vitest";
import { planSchedule, sortTasksForPlanning } from "../engine";
import { expandCommitments } from "../recurrence";
import { durationMin, localDateOf, localMinutesOf, overlaps, type Interval } from "../time";
import type { ExistingSession, PlanInput, PlanResult } from "../types";
import { at, baseInput, commitment, MONDAY, prefs, task, TZ } from "./fixtures";
import { buildDayFrame } from "../day";

function assertNoDoubleBooking(input: PlanInput, result: PlanResult) {
  const blocks: Interval[] = [
    ...result.sessions,
    ...input.occurrences.map((o) => ({ start: o.blockStart, end: o.blockEnd })),
    ...input.existingSessions.filter((s) => s.status !== "skipped" && (s.locked || s.status !== "planned" || s.start < input.now)),
    ...input.days.flatMap((d) => buildDayFrame(d, input.prefs, TZ).meals),
  ];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      expect(overlaps(blocks[i], blocks[j]), `blocks ${i} and ${j} overlap`).toBe(false);
    }
  }
}

const taskSessions = (r: PlanResult, id?: string) =>
  r.sessions.filter((s) => s.kind === "task" && (id === undefined || s.taskId === id));

describe("planSchedule", () => {
  it("never double-books around commitments, meals and other tasks", () => {
    const occurrences = expandCommitments(
      [
        commitment({
          id: "lec",
          title: "Lecture",
          startTime: "10:00",
          endTime: "12:00",
          travelBeforeMinutes: 20,
          travelAfterMinutes: 20,
          recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5], untilDate: null },
        }),
        commitment({ id: "shift", title: "Work shift", startDate: "2026-10-28", startTime: "14:00", endTime: "17:00" }),
      ],
      MONDAY,
      "2026-11-01",
    );
    const input = baseInput({
      occurrences,
      tasks: [
        task({ title: "Essay", estimatedMinutes: 300, deadline: at("2026-10-29", "23:59"), priority: "high" }),
        task({ title: "Coding", estimatedMinutes: 120, deadline: at("2026-10-27", "17:00"), priority: "high" }),
        task({ title: "Reading", estimatedMinutes: 90, category: "study" }),
        task({ title: "Groceries", estimatedMinutes: 45, category: "errands" }),
      ],
    });
    const result = planSchedule(input);
    expect(result.feasible).toBe(true);
    assertNoDoubleBooking(input, result);
  });

  it("only schedules tasks inside working hours and never in the past", () => {
    const input = baseInput({
      now: at(MONDAY, "15:07"),
      tasks: [task({ title: "Big", estimatedMinutes: 600 })],
    });
    const result = planSchedule(input);
    for (const s of taskSessions(result)) {
      expect(s.start).toBeGreaterThanOrEqual(input.now);
      const startMin = localMinutesOf(s.start, TZ);
      const endMin = localMinutesOf(s.end, TZ);
      expect(startMin).toBeGreaterThanOrEqual(9 * 60);
      expect(endMin).toBeLessThanOrEqual(18 * 60);
      expect(startMin % 15).toBe(0);
    }
  });

  it("finishes every session before the task's deadline", () => {
    const deadline = at("2026-10-27", "13:00");
    const result = planSchedule(baseInput({ tasks: [task({ id: "d", title: "Report", estimatedMinutes: 240, deadline })] }));
    expect(taskSessions(result, "d").length).toBeGreaterThan(0);
    for (const s of taskSessions(result, "d")) expect(s.end).toBeLessThanOrEqual(deadline);
    expect(result.unscheduled).toHaveLength(0);
  });

  it("orders work by deadline first, weighted by priority", () => {
    const now = at(MONDAY, "08:00");
    const end = at("2026-11-01", "22:00");
    const ordered = sortTasksForPlanning(
      [
        task({ id: "friday", title: "Fri", deadline: at("2026-10-30", "17:00"), priority: "medium" }),
        task({ id: "tomorrow", title: "Tue", deadline: at("2026-10-27", "17:00"), priority: "medium" }),
        task({ id: "none", title: "Whenever", deadline: null, priority: "urgent" }),
        task({ id: "overdue", title: "Late", deadline: at("2026-10-25", "17:00"), priority: "low" }),
      ],
      now,
      end,
    );
    expect(ordered.map((t) => t.id)).toEqual(["overdue", "tomorrow", "friday", "none"]);
  });

  it("splits large tasks into sessions within the preferred length, spread over days", () => {
    const result = planSchedule(
      baseInput({ tasks: [task({ id: "essay", title: "Essay", estimatedMinutes: 300, deadline: at("2026-10-30", "17:00") })] }),
    );
    const sessions = taskSessions(result, "essay");
    expect(sessions.reduce((s, x) => s + durationMin(x), 0)).toBe(300);
    for (const s of sessions) {
      expect(durationMin(s)).toBeLessThanOrEqual(prefs.sessionMinutes + 25);
      expect(durationMin(s)).toBeGreaterThanOrEqual(25);
    }
    const daysUsed = new Set(sessions.map((s) => localDateOf(s.start, TZ)));
    expect(daysUsed.size).toBeGreaterThan(1);
  });

  it("keeps a non-splittable task in one block, and explains when it can't fit", () => {
    const ok = planSchedule(baseInput({ tasks: [task({ id: "exam", title: "Mock exam", estimatedMinutes: 120, splittable: false })] }));
    expect(taskSessions(ok, "exam")).toHaveLength(1);
    expect(durationMin(taskSessions(ok, "exam")[0])).toBe(120);

    const tooBig = planSchedule(
      baseInput({
        prefs: { ...prefs, maxFocusMinutes: 120 },
        tasks: [task({ id: "big", title: "Thesis chapter", estimatedMinutes: 240, splittable: false, deadline: at("2026-10-28", "17:00") })],
      }),
    );
    expect(tooBig.feasible).toBe(false);
    expect(tooBig.unscheduled[0].reason).toBe("no_slot_long_enough");
    expect(tooBig.suggestions.some((s) => s.kind === "split_task")).toBe(true);
  });

  it("puts breaks between back-to-back focus sessions", () => {
    const result = planSchedule(
      baseInput({ tasks: [task({ id: "a", title: "A", estimatedMinutes: 200, deadline: at(MONDAY, "17:30") })] }),
    );
    const focus = taskSessions(result).sort((x, y) => x.start - y.start);
    for (let i = 1; i < focus.length; i++) {
      expect(focus[i].start - focus[i - 1].end).toBeGreaterThanOrEqual(prefs.breakMinutes * 60_000);
    }
    expect(result.sessions.some((s) => s.kind === "break")).toBe(true);
  });

  it("caps daily focus time and keeps a buffer", () => {
    const result = planSchedule(
      baseInput({ tasks: [task({ title: "Huge", estimatedMinutes: 2000 }), task({ title: "Huge 2", estimatedMinutes: 2000 })] }),
    );
    for (const day of result.days) {
      expect(day.plannedMinutes).toBeLessThanOrEqual(prefs.maxFocusMinutes);
      expect(day.plannedMinutes).toBeLessThanOrEqual(Math.floor(day.availableMinutes * 0.85) + 1);
    }
  });

  it("leaves rest days free", () => {
    const result = planSchedule(baseInput({ tasks: [task({ title: "Lots", estimatedMinutes: 3000 })] }));
    const weekend = taskSessions(result).filter((s) => ["2026-10-31", "2026-11-01"].includes(localDateOf(s.start, TZ)));
    expect(weekend).toHaveLength(0);
  });

  it("warns, explains and suggests alternatives when work doesn't fit", () => {
    const deadline = at(MONDAY, "18:00");
    const input = baseInput({
      now: at(MONDAY, "13:00"),
      tasks: [
        task({ id: "u1", title: "Lab report", estimatedMinutes: 360, deadline, priority: "urgent" }),
        task({ id: "u2", title: "Problem set", estimatedMinutes: 240, deadline, priority: "high" }),
        task({ id: "low", title: "Tidy notes", estimatedMinutes: 60, priority: "low" }),
      ],
    });
    const result = planSchedule(input);
    expect(result.feasible).toBe(false);
    expect(result.unscheduled.map((u) => u.taskId)).toContain("u2");
    expect(result.unscheduled.every((u) => u.explanation.length > 20)).toBe(true);
    expect(result.days[0].status).toBe("overloaded");
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.headline).toMatch(/can't fully fit/);
    assertNoDoubleBooking(input, result);
  });

  it("flags tasks that only just make their deadline", () => {
    const result = planSchedule(
      baseInput({
        now: at(MONDAY, "14:00"),
        tasks: [task({ id: "tight", title: "Slides", estimatedMinutes: 120, deadline: at(MONDAY, "17:30") })],
      }),
    );
    expect(result.unscheduled).toHaveLength(0);
    expect(result.atRisk.map((a) => a.taskId)).toEqual(["tight"]);
  });

  it("preserves locked and completed sessions and reschedules missed ones", () => {
    const essay = task({ id: "essay", title: "Essay", estimatedMinutes: 180, deadline: at("2026-10-29", "17:00") });
    const existing: ExistingSession[] = [
      // Missed this morning: still counts as remaining work.
      { id: "m", taskId: "essay", kind: "task", start: at(MONDAY, "09:00"), end: at(MONDAY, "10:00"), status: "planned", locked: false },
      // Done yesterday-ish: counts as progress via completedMinutes.
      { id: "d", taskId: "essay", kind: "task", start: at(MONDAY, "10:15"), end: at(MONDAY, "10:45"), status: "done", locked: false },
      // User pinned this block for Tuesday.
      { id: "l", taskId: "essay", kind: "task", start: at("2026-10-27", "15:00"), end: at("2026-10-27", "16:00"), status: "planned", locked: true },
      // Unlocked future block: planner-owned, will be replaced.
      { id: "f", taskId: "essay", kind: "task", start: at("2026-10-28", "09:00"), end: at("2026-10-28", "10:00"), status: "planned", locked: false },
    ];
    const input = baseInput({
      now: at(MONDAY, "11:00"),
      tasks: [essay],
      existingSessions: existing,
      completedMinutes: { essay: 30 },
    });
    const result = planSchedule(input);
    // 180 - 30 done - 60 locked = 90 new minutes.
    expect(taskSessions(result, "essay").reduce((s, x) => s + durationMin(x), 0)).toBe(90);
    for (const s of result.sessions) {
      expect(overlaps(s, { start: at("2026-10-27", "15:00"), end: at("2026-10-27", "16:00") })).toBe(false);
    }
    assertNoDoubleBooking(input, result);
  });

  it("schedules overdue work as soon as possible and reports it", () => {
    const result = planSchedule(
      baseInput({ tasks: [task({ id: "late", title: "Late form", estimatedMinutes: 30, deadline: at("2026-10-23", "17:00") })] }),
    );
    const [s] = taskSessions(result, "late");
    expect(localDateOf(s.start, TZ)).toBe(MONDAY);
    expect(result.atRisk.find((a) => a.taskId === "late")?.slackMinutes).toBeLessThan(0);
  });

  it("respects the earliest start date", () => {
    const result = planSchedule(
      baseInput({ tasks: [task({ id: "later", title: "Revision", estimatedMinutes: 60, earliestStart: "2026-10-28" })] }),
    );
    for (const s of taskSessions(result, "later")) expect(localDateOf(s.start, TZ) >= "2026-10-28").toBe(true);
  });

  it("prefers the requested time of day", () => {
    const result = planSchedule(
      baseInput({ tasks: [task({ id: "eve", title: "Practice", estimatedMinutes: 45, preferredTime: "afternoon", category: "personal" })] }),
    );
    const [s] = taskSessions(result, "eve");
    expect(localMinutesOf(s.start, TZ)).toBeGreaterThanOrEqual(12 * 60);
  });

  it("is deterministic", () => {
    const input = baseInput({
      tasks: [task({ title: "One", estimatedMinutes: 100 }), task({ title: "Two", estimatedMinutes: 70, priority: "high" })],
    });
    expect(planSchedule(input)).toEqual(planSchedule(input));
  });

  it("handles an overnight commitment and a night-owl schedule", () => {
    const owl = { ...prefs, wakeTime: "11:00", bedTime: "02:00", workStart: "13:00", workEnd: "01:00", breakfastTime: null };
    const occurrences = expandCommitments(
      [commitment({ id: "bar", title: "Bar shift", startTime: "19:00", endTime: "00:30" })],
      MONDAY,
      "2026-11-01",
    );
    const input = baseInput({ prefs: owl, occurrences, tasks: [task({ title: "Coding", estimatedMinutes: 240 })] });
    const result = planSchedule(input);
    assertNoDoubleBooking(input, result);
    for (const s of taskSessions(result)) {
      expect(overlaps(s, { start: at(MONDAY, "19:00"), end: at("2026-10-27", "00:30") })).toBe(false);
    }
  });
});
