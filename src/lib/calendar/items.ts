import { buildDayFrame } from "@/lib/scheduler/day";
import { conflictingOccurrenceKeys, findCommitmentConflicts } from "@/lib/scheduler/conflicts";
import { isMissedSession } from "@/lib/scheduler/engine";
import type { CommitmentOccurrence, SchedulingPrefs } from "@/lib/scheduler/types";
import type { LocalDate } from "@/lib/scheduler/time";
import type { SessionRow, TaskRow } from "@/lib/data/rows";
import { toSession } from "@/lib/data/mappers";

export type CalendarItemType = "commitment" | "task" | "break" | "meal";

/** A serialisable block for the calendar views. Times are epoch ms. */
export interface CalendarItem {
  key: string;
  type: CalendarItemType;
  title: string;
  start: number;
  end: number;
  /** Start/end including travel time (commitments only). */
  blockStart: number;
  blockEnd: number;
  location?: string | null;
  kind?: string;
  commitmentId?: string;
  occurrenceDate?: LocalDate;
  isMandatory?: boolean;
  conflict?: boolean;
  sessionId?: string;
  taskId?: string | null;
  category?: TaskRow["category"];
  priority?: TaskRow["priority"];
  deadline?: number | null;
  status?: SessionRow["status"];
  locked?: boolean;
  missed?: boolean;
  taskCompleted?: boolean;
}

export function buildCalendarItems(args: {
  days: LocalDate[];
  prefs: SchedulingPrefs;
  tz: string;
  occurrences: CommitmentOccurrence[];
  sessions: SessionRow[];
  tasks: TaskRow[];
  now: number;
}): CalendarItem[] {
  const { days, prefs, tz, now } = args;
  const taskById = new Map(args.tasks.map((t) => [t.id, t]));
  const conflictKeys = conflictingOccurrenceKeys(findCommitmentConflicts(args.occurrences));
  const items: CalendarItem[] = [];

  for (const o of args.occurrences) {
    const key = `${o.commitmentId}|${o.date}`;
    items.push({
      key: `c:${key}`,
      type: "commitment",
      title: o.title,
      start: o.start,
      end: o.end,
      blockStart: o.blockStart,
      blockEnd: o.blockEnd,
      location: o.location,
      kind: o.kind,
      commitmentId: o.commitmentId,
      occurrenceDate: o.date,
      isMandatory: o.isMandatory,
      conflict: conflictKeys.has(key),
    });
  }

  for (const row of args.sessions) {
    if (row.status === "skipped") continue;
    const s = toSession(row);
    const task = row.task_id ? taskById.get(row.task_id) : undefined;
    if (row.kind === "task" && !task) continue; // task completed long ago and not loaded
    items.push({
      key: `s:${row.id}`,
      type: row.kind === "task" ? "task" : "break",
      title: row.kind === "task" ? task!.title : "Break",
      start: s.start,
      end: s.end,
      blockStart: s.start,
      blockEnd: s.end,
      sessionId: row.id,
      taskId: row.task_id,
      category: task?.category,
      priority: task?.priority,
      deadline: task?.deadline ? Date.parse(task.deadline) : null,
      status: row.status,
      locked: row.locked,
      missed: isMissedSession(s, now) && task?.status !== "completed",
      taskCompleted: task?.status === "completed",
    });
  }

  for (const date of days) {
    const frame = buildDayFrame(date, prefs, tz);
    frame.meals.forEach((m, i) => {
      items.push({ key: `m:${date}:${i}`, type: "meal", title: m.label, start: m.start, end: m.end, blockStart: m.start, blockEnd: m.end });
    });
  }

  return items.sort((a, b) => a.start - b.start || a.end - b.end);
}
