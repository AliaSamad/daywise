import { describe, expect, it } from "vitest";
import { categoryAccuracy, describeAccuracy, suggestEstimate } from "../reality";

describe("Reality Mode accuracy", () => {
  it("stays quiet until there is enough data", () => {
    const acc = categoryAccuracy([
      { minutes: 100, estimated_minutes: 60, category: "study" },
      { minutes: 90, estimated_minutes: 60, category: "study" },
    ]);
    expect(acc[0].reliable).toBe(false);
    expect(suggestEstimate(60, acc[0])).toBeNull();
  });

  it("suggests a realistic estimate from consistent underestimates", () => {
    const entries = [100, 95, 80, 85, 110].map((m) => ({ minutes: m, estimated_minutes: 60, category: "study" as const }));
    const [acc] = categoryAccuracy(entries);
    expect(acc.reliable).toBe(true);
    expect(acc.medianRatio).toBeCloseTo(95 / 60);
    expect(acc.underestimateRate).toBe(1);
    expect(suggestEstimate(60, acc)).toBe(95);
    expect(describeAccuracy(acc, "Study")).toBe("You usually need 58% more time for study tasks than you first estimate.");
  });

  it("does not nag when estimates are already accurate", () => {
    const entries = [62, 58, 60, 61, 59].map((m) => ({ minutes: m, estimated_minutes: 60, category: "work" as const }));
    expect(suggestEstimate(60, categoryAccuracy(entries)[0])).toBeNull();
  });
});
