import { describe, expect, it } from "vitest";
import { describeRecurrence, expandCommitment } from "../recurrence";
import { localMinutesOf } from "../time";
import { commitment, TZ } from "./fixtures";

describe("recurrence expansion", () => {
  it("keeps weekly events at the same local time across DST", () => {
    const c = commitment({
      id: "c1",
      title: "Lecture",
      startDate: "2026-10-19",
      startTime: "09:00",
      endTime: "10:00",
      recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 3], untilDate: null },
    });
    const occ = expandCommitment(c, "2026-10-19", "2026-11-01");
    expect(occ.map((o) => o.date)).toEqual(["2026-10-19", "2026-10-21", "2026-10-26", "2026-10-28"]);
    for (const o of occ) expect(localMinutesOf(o.start, TZ)).toBe(9 * 60);
  });

  it("supports every-other-week, until dates and cancelled occurrences", () => {
    const c = commitment({
      id: "c2",
      title: "Lab",
      startDate: "2026-10-05",
      recurrence: { freq: "weekly", interval: 2, byWeekday: [1], untilDate: "2026-11-16" },
      exceptions: ["2026-11-02"],
    });
    const occ = expandCommitment(c, "2026-10-01", "2026-12-31");
    expect(occ.map((o) => o.date)).toEqual(["2026-10-05", "2026-10-19", "2026-11-16"]);
  });

  it("includes an overnight shift that started the previous evening", () => {
    const c = commitment({
      id: "c3",
      title: "Night shift",
      startDate: "2026-10-25",
      startTime: "22:00",
      endTime: "06:00",
      recurrence: { freq: "daily", interval: 1, byWeekday: null, untilDate: null },
    });
    const occ = expandCommitment(c, "2026-10-26", "2026-10-26");
    expect(occ.map((o) => o.date)).toEqual(["2026-10-25", "2026-10-26"]);
    expect((occ[0].end - occ[0].start) / 3_600_000).toBe(8);
  });

  it("adds travel time around the block", () => {
    const c = commitment({ id: "c4", title: "Gym", travelBeforeMinutes: 20, travelAfterMinutes: 15 });
    const [o] = expandCommitment(c, "2026-10-26", "2026-10-26");
    expect((o.start - o.blockStart) / 60_000).toBe(20);
    expect((o.blockEnd - o.end) / 60_000).toBe(15);
  });

  it("describes rules in plain English", () => {
    expect(describeRecurrence({ startDate: "2026-10-26", recurrence: null })).toBe("One-time");
    expect(
      describeRecurrence({ startDate: "2026-10-26", recurrence: { freq: "weekly", interval: 1, byWeekday: [3, 1], untilDate: null } }),
    ).toBe("Weekly on Mon, Wed");
  });
});
