import { describe, expect, it } from "vitest";
import { parseTasks, splitClauses } from "../parse-tasks";

const MONDAY = "2026-10-26";

describe("parseTasks", () => {
  it("parses the example sentence into three structured tasks", () => {
    const tasks = parseTasks(
      "I have an essay due Thursday that will take about 5 hours, a coding assignment due tomorrow that takes 2 hours, and I need to buy groceries.",
      MONDAY,
    );
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({ title: "Essay", estimatedMinutes: 300, deadlineDate: "2026-10-29", category: "study", durationGuessed: false });
    expect(tasks[1]).toMatchObject({ title: "Coding assignment", estimatedMinutes: 120, deadlineDate: "2026-10-27", priority: "high", category: "study" });
    expect(tasks[2]).toMatchObject({ title: "Buy groceries", category: "errands", deadlineDate: null, durationGuessed: true });
  });

  it("understands durations in many forms", () => {
    const [a, b, c, d, e] = parseTasks(
      "read chapter 4 for 45 mins; gym 1.5 hours; call mum half an hour; slides 1h 30m; revise an hour and a half",
      MONDAY,
    );
    expect(a.estimatedMinutes).toBe(45);
    expect(b.estimatedMinutes).toBe(90);
    expect(c.estimatedMinutes).toBe(30);
    expect(d.estimatedMinutes).toBe(90);
    expect(e.estimatedMinutes).toBe(90);
  });

  it("understands deadlines and times", () => {
    const [a, b, c, d] = parseTasks("report by Friday 5pm\nform due 3 Nov\nlab writeup due next monday\nemail tutor today", MONDAY);
    expect(a).toMatchObject({ deadlineDate: "2026-10-30", deadlineTime: "17:00", category: "work" });
    expect(b).toMatchObject({ deadlineDate: "2026-11-03", deadlineTime: "23:59" });
    expect(c.deadlineDate).toBe("2026-11-02");
    expect(d.deadlineDate).toBe(MONDAY);
  });

  it("picks up priority words", () => {
    const [a, b] = parseTasks("urgent: renew visa application; tidy desk whenever", MONDAY);
    expect(a.priority).toBe("urgent");
    expect(b.priority).toBe("low");
  });

  it("does not split titles that contain 'and'", () => {
    expect(splitClauses("research and write the intro")).toEqual(["research and write the intro"]);
  });
});
