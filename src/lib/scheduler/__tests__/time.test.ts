import { describe, expect, it } from "vitest";
import {
  addDaysLocal,
  localDateOf,
  mergeIntervals,
  startOfWeekLocal,
  subtractIntervals,
  weekdayOf,
  zonedInstant,
  zonedSpan,
} from "../time";

describe("time helpers", () => {
  it("resolves wall-clock times across a DST change", () => {
    // 24 Oct 2026 is BST (UTC+1); 26 Oct is GMT (UTC+0).
    expect(new Date(zonedInstant("2026-10-24", "09:00", "Europe/London")).toISOString()).toBe("2026-10-24T08:00:00.000Z");
    expect(new Date(zonedInstant("2026-10-26", "09:00", "Europe/London")).toISOString()).toBe("2026-10-26T09:00:00.000Z");
  });

  it("treats an end time before the start as crossing midnight", () => {
    const span = zonedSpan("2026-10-26", "22:00", "02:00", "Europe/London");
    expect((span.end - span.start) / 3_600_000).toBe(4);
    expect(localDateOf(span.end, "Europe/London")).toBe("2026-10-27");
  });

  it("handles the 25-hour day when clocks go back", () => {
    const span = zonedSpan("2026-10-25", "00:00", "00:00", "Europe/London");
    expect((span.end - span.start) / 3_600_000).toBe(25);
  });

  it("does calendar arithmetic without drifting", () => {
    expect(addDaysLocal("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysLocal("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayOf("2026-10-26")).toBe(1);
    expect(startOfWeekLocal("2026-11-01")).toBe("2026-10-26");
  });

  it("merges and subtracts intervals", () => {
    expect(mergeIntervals([{ start: 5, end: 8 }, { start: 0, end: 3 }, { start: 3, end: 6 }])).toEqual([{ start: 0, end: 8 }]);
    expect(subtractIntervals({ start: 0, end: 10 }, [{ start: 2, end: 4 }, { start: 8, end: 12 }])).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 8 },
    ]);
  });
});
