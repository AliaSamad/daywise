import { describe, expect, it } from "vitest";
import { findCommitmentConflicts, validateSessionMove } from "../conflicts";
import { expandCommitments } from "../recurrence";
import { at, commitment, MONDAY, prefs, TZ } from "./fixtures";

describe("commitment conflicts", () => {
  it("flags direct overlaps and travel clashes separately", () => {
    const occ = expandCommitments(
      [
        commitment({ id: "a", title: "Seminar", startTime: "10:00", endTime: "11:00" }),
        commitment({ id: "b", title: "Dentist", startTime: "10:30", endTime: "11:30" }),
        commitment({ id: "c", title: "Gym", startTime: "12:00", endTime: "13:00", travelBeforeMinutes: 40 }),
      ],
      MONDAY,
      MONDAY,
    );
    const conflicts = findCommitmentConflicts(occ);
    expect(conflicts.find((c) => c.severity === "overlap")).toMatchObject({ a: { title: "Seminar" }, b: { title: "Dentist" } });
    expect(conflicts.find((c) => c.severity === "travel")).toMatchObject({ b: { title: "Gym" } });
  });

  it("finds clashes between recurring events", () => {
    const occ = expandCommitments(
      [
        commitment({ id: "w", title: "Weekly lab", recurrence: { freq: "weekly", interval: 1, byWeekday: [3], untilDate: null } }),
        commitment({ id: "o", title: "Interview", startDate: "2026-11-04", startTime: "10:30", endTime: "11:30" }),
      ],
      MONDAY,
      "2026-11-08",
    );
    expect(findCommitmentConflicts(occ).filter((c) => c.severity === "overlap")).toHaveLength(1);
  });
});

describe("validateSessionMove", () => {
  const occ = expandCommitments([commitment({ id: "lec", title: "Lecture", startTime: "10:00", endTime: "11:00", travelAfterMinutes: 15 })], MONDAY, MONDAY);
  const base = {
    now: at(MONDAY, "08:00"),
    tz: TZ,
    prefs,
    occurrences: occ,
    sessions: [{ id: "other", kind: "task" as const, title: "Reading", start: at(MONDAY, "14:00"), end: at(MONDAY, "15:00") }],
  };
  const move = (start: string, end: string, deadline: number | null = null) => ({
    sessionId: "me",
    taskTitle: "Essay",
    start: at(MONDAY, start),
    end: at(MONDAY, end),
    deadline,
  });

  it("accepts a clean move", () => {
    expect(validateSessionMove({ ...base, move: move("15:30", "16:30") })).toEqual({ errors: [], warnings: [] });
  });

  it("blocks overlaps with commitments and other sessions", () => {
    expect(validateSessionMove({ ...base, move: move("10:30", "11:30") }).errors[0]).toMatch(/Lecture/);
    expect(validateSessionMove({ ...base, move: move("14:30", "15:30") }).errors[0]).toMatch(/Reading/);
  });

  it("blocks sleep hours and the past", () => {
    expect(validateSessionMove({ ...base, move: move("06:00", "07:00") }).errors).toContain("That time has already passed.");
    expect(validateSessionMove({ ...base, now: at(MONDAY, "05:00"), move: move("06:00", "07:00") }).errors).toContain(
      "That's outside your waking hours.",
    );
  });

  it("warns about soft problems", () => {
    const r = validateSessionMove({ ...base, move: move("12:15", "13:05", at(MONDAY, "13:00")) });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/meal/);
    expect(r.warnings.join(" ")).toMatch(/deadline/);
    expect(validateSessionMove({ ...base, move: move("11:00", "11:45") }).warnings.join(" ")).toMatch(/travel/);
    expect(validateSessionMove({ ...base, move: move("13:00", "13:55") }).warnings.join(" ")).toMatch(/no break/);
    expect(validateSessionMove({ ...base, move: move("18:30", "19:30") }).warnings.join(" ")).toMatch(/working hours/);
  });
});
