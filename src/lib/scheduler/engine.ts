import { buildDayFrame, occurrencesOnDay, timeOfDayBand, type DayFrame } from "./day";
import {
  ceilToStep,
  durationMin,
  formatDuration,
  intersect,
  localDateOf,
  MINUTE,
  mergeIntervals,
  overlaps,
  subtractIntervals,
  daysBetween,
  type Interval,
  type LocalDate,
} from "./time";
import type {
  AtRiskTask,
  DayLoad,
  ExistingSession,
  PlanInput,
  PlannedSession,
  PlanResult,
  Priority,
  Suggestion,
  Task,
  UnscheduledTask,
} from "./types";

/** All planned blocks start on a 15-minute grid. */
export const STEP_MIN = 15;
/** A task is "at risk" when it would finish less than this long before its deadline. */
export const AT_RISK_SLACK_MIN = 120;

const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
/** How many days of deadline slack each priority level is worth when ordering work. */
const PRIORITY_DAYS: Record<Priority, number> = { low: -1, medium: 0, high: 1, urgent: 2 };

interface DayState {
  frame: DayFrame;
  /** Free intervals inside working hours, ignoring focus sessions. */
  free: Interval[];
  availableMinutes: number;
  capacityMinutes: number;
  usedMinutes: number;
  commitmentMinutes: number;
}

/**
 * Sessions that apply_plan will keep: anything locked, finished, skipped, or already started.
 * Everything else is planner-owned and gets replaced.
 */
export function isKeptSession(s: ExistingSession, now: number): boolean {
  return s.locked || s.status !== "planned" || s.start < now;
}

/** A planned session that ended without being marked done. */
export function isMissedSession(s: ExistingSession, now: number): boolean {
  return s.kind === "task" && s.status === "planned" && s.end <= now;
}

export function priorityLabel(p: Priority): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function taskOrderKey(t: Task, now: number, horizonEnd: number): number {
  const deadline = t.deadline ?? horizonEnd + 7 * 86_400_000;
  const slackDays = (deadline - now) / 86_400_000;
  return slackDays - PRIORITY_DAYS[t.priority];
}

export function sortTasksForPlanning(tasks: Task[], now: number, horizonEnd: number): Task[] {
  return tasks.slice().sort((a, b) => {
    const aOverdue = a.deadline !== null && a.deadline <= now;
    const bOverdue = b.deadline !== null && b.deadline <= now;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    const d = taskOrderKey(a, now, horizonEnd) - taskOrderKey(b, now, horizonEnd);
    if (Math.abs(d) > 1e-9) return d;
    const p = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (p !== 0) return p;
    return a.id.localeCompare(b.id);
  });
}

function fmtDeadline(deadline: number, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(deadline);
}

function fmtDay(date: LocalDate): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/**
 * Deterministic planner. Places fixed commitments, meals and kept sessions first, then fits
 * flexible tasks into realistic focus capacity, ordered by deadline and priority.
 */
export function planSchedule(input: PlanInput): PlanResult {
  const { now, timezone: tz, prefs } = input;
  const nowSlot = ceilToStep(now, STEP_MIN);
  const kept = input.existingSessions.filter((s) => isKeptSession(s, now));
  const keptFocus = kept.filter((s) => s.kind === "task" && s.status !== "skipped");
  const keptBlocks: Interval[] = kept.filter((s) => s.status !== "skipped").map((s) => ({ start: s.start, end: s.end }));
  const breakMs = prefs.breakMinutes * MINUTE;

  // ---- Build each day's free time --------------------------------------------------------
  const days: DayState[] = input.days.map((date) => {
    const frame = buildDayFrame(date, prefs, tz);
    const occ = occurrencesOnDay(frame, input.occurrences);
    const hardBusy: Interval[] = [
      ...occ.map((o) => ({ start: o.blockStart, end: o.blockEnd })),
      ...frame.meals,
      ...(input.extraBusy ?? []),
      ...keptBlocks,
    ];
    let free: Interval[] = [];
    if (frame.work) {
      const window = { start: Math.max(frame.work.start, nowSlot), end: frame.work.end };
      if (window.end > window.start) free = subtractIntervals(window, hardBusy);
    }
    const availableMinutes = free.reduce((sum, i) => sum + durationMin(i), 0);
    const usedMinutes = keptFocus
      .filter((s) => localDateOf(s.start, tz) === date)
      .reduce((sum, s) => sum + durationMin(s), 0);
    const focusCap = Math.max(0, Math.round(prefs.maxFocusMinutes * frame.capacityFactor) - usedMinutes);
    const bufferCap = Math.floor(availableMinutes * (1 - prefs.bufferPercent / 100));
    const commitmentMinutes = occ.reduce((sum, o) => {
      const part = intersect({ start: o.start, end: o.end }, frame.awake);
      return sum + (part ? durationMin(part) : 0);
    }, 0);
    return {
      frame,
      free,
      availableMinutes,
      capacityMinutes: usedMinutes + Math.min(focusCap, bufferCap),
      usedMinutes,
      commitmentMinutes,
    };
  });

  const horizonEnd = days.length ? days[days.length - 1].frame.awake.end : now;
  const placed: PlannedSession[] = [];
  /** Focus sessions widened by a break on each side: no other focus block may overlap these. */
  const focusGuards: Interval[] = keptFocus.map((s) => ({ start: s.start - breakMs, end: s.end + breakMs }));

  // ---- Remaining work per task -------------------------------------------------------------
  const keptFutureByTask = new Map<string, number>();
  for (const s of keptFocus) {
    if (!s.taskId || s.status === "done") continue;
    if (isMissedSession(s, now)) continue; // missed work must be rescheduled
    keptFutureByTask.set(s.taskId, (keptFutureByTask.get(s.taskId) ?? 0) + durationMin(s));
  }
  const remaining = new Map<string, number>();
  for (const t of input.tasks) {
    if (t.status === "completed") continue;
    const done = input.completedMinutes?.[t.id] ?? 0;
    remaining.set(t.id, Math.max(0, t.estimatedMinutes - done - (keptFutureByTask.get(t.id) ?? 0)));
  }

  const ordered = sortTasksForPlanning(
    input.tasks.filter((t) => t.status !== "completed"),
    now,
    horizonEnd,
  );

  // ---- Slot search -------------------------------------------------------------------------
  function findSlot(day: DayState, task: Task, len: number, latestEnd: number): Interval | null {
    const lenMs = len * MINUTE;
    const band =
      task.preferredTime ??
      (task.category === "study" || task.category === "work" ? prefs.focusPreference : null);
    const bandWindow = band ? timeOfDayBand(day.frame, band, tz) : null;
    let best: { slot: Interval; score: number } | null = null;
    for (const gap of day.free) {
      const usable = subtractIntervals(gap, focusGuards);
      for (const u of usable) {
        for (let s = ceilToStep(u.start, STEP_MIN); s + lenMs <= Math.min(u.end, latestEnd); s += STEP_MIN * MINUTE) {
          const slot = { start: s, end: s + lenMs };
          let score = -(s - day.frame.awake.start) / (60 * MINUTE); // mild preference for earlier
          if (bandWindow && bandWindow.end > bandWindow.start) {
            const inBand = intersect(slot, bandWindow);
            if (inBand) score += 30 * (durationMin(inBand) / len);
          }
          if (!best || score > best.score) best = { slot, score };
        }
      }
    }
    return best?.slot ?? null;
  }

  function place(day: DayState, task: Task, slot: Interval) {
    placed.push({ taskId: task.id, kind: "task", start: slot.start, end: slot.end });
    focusGuards.push({ start: slot.start - breakMs, end: slot.end + breakMs });
    day.free = day.free.flatMap((f) => subtractIntervals(f, [slot]));
    const len = durationMin(slot);
    day.usedMinutes += len;
    remaining.set(task.id, (remaining.get(task.id) ?? 0) - len);
  }

  /** Short tasks are done in one sitting even when splitting is allowed. */
  function isSplittable(task: Task, rem: number): boolean {
    return task.splittable && rem >= task.minSessionMinutes * 2;
  }

  /** A length is usable if it leaves nothing, or leaves enough for another real session. */
  function leavesUsableRemainder(task: Task, rem: number, len: number): boolean {
    const left = rem - len;
    return left === 0 || left >= task.minSessionMinutes;
  }

  /** Choose a session length for this task on this day, honouring split rules. */
  function chunkLength(task: Task, rem: number, roomToday: number, perDayRoom: number): number {
    if (!isSplittable(task, rem)) return rem <= roomToday ? rem : 0;
    let len = Math.min(rem, prefs.sessionMinutes, roomToday, perDayRoom);
    if (len < task.minSessionMinutes) return 0;
    if (!leavesUsableRemainder(task, rem, len)) {
      // e.g. 70 minutes left with 50-minute sessions: do 35 + 35 rather than 50 + 20.
      const half = Math.ceil(rem / 2);
      if (len >= half && half >= task.minSessionMinutes) len = half;
      else if (rem - task.minSessionMinutes >= task.minSessionMinutes) len = Math.min(len, rem - task.minSessionMinutes);
      else return 0;
    }
    return len;
  }

  /** Shorter fallback lengths to try when the ideal one has no slot. */
  function shorterLength(task: Task, rem: number, len: number): number {
    if (!isSplittable(task, rem)) return 0;
    for (let next = len - STEP_MIN; next >= task.minSessionMinutes; next -= STEP_MIN) {
      if (leavesUsableRemainder(task, rem, next)) return next;
    }
    return 0;
  }

  for (const task of ordered) {
    const overdue = task.deadline !== null && task.deadline <= now;
    const latestEnd = overdue || task.deadline === null ? Number.POSITIVE_INFINITY : task.deadline;
    const deadlineDate = task.deadline !== null && !overdue ? localDateOf(task.deadline, tz) : null;
    const eligible = days.filter((d) => {
      if (task.earliestStart && daysBetween(task.earliestStart, d.frame.date) < 0) return false;
      if (deadlineDate && daysBetween(d.frame.date, deadlineDate) < 0) return false;
      return d.frame.capacityFactor > 0;
    });
    if (eligible.length === 0) continue;

    // Pass 1 spreads the work, aiming to finish the day before the deadline.
    const spreadDays =
      deadlineDate && eligible.length > 1 && eligible[eligible.length - 1].frame.date === deadlineDate
        ? eligible.slice(0, -1)
        : eligible;
    const initial = remaining.get(task.id) ?? 0;
    const perDayTarget = Math.max(
      prefs.sessionMinutes,
      task.minSessionMinutes,
      Math.ceil(initial / spreadDays.length / STEP_MIN) * STEP_MIN,
    );

    for (const pass of [1, 2] as const) {
      const passDays = pass === 1 ? spreadDays : eligible;
      for (const day of passDays) {
        let placedToday = 0;
        for (let guard = 0; guard < 24; guard++) {
          const rem = remaining.get(task.id) ?? 0;
          if (rem <= 0) break;
          const roomToday = day.capacityMinutes - day.usedMinutes;
          const perDayRoom = pass === 1 ? perDayTarget - placedToday : Number.POSITIVE_INFINITY;
          let len = chunkLength(task, rem, roomToday, perDayRoom);
          let slot: Interval | null = null;
          while (len > 0) {
            slot = findSlot(day, task, len, latestEnd);
            if (slot) break;
            len = shorterLength(task, rem, len);
          }
          if (!slot) break;
          place(day, task, slot);
          placedToday += durationMin(slot);
        }
      }
      if ((remaining.get(task.id) ?? 0) <= 0) break;
    }
  }

  // ---- Breaks between consecutive focus blocks ---------------------------------------------
  const allFocus = [...placed, ...keptFocus.map((s) => ({ start: s.start, end: s.end }))].sort((a, b) => a.start - b.start);
  const hardAll: Interval[] = mergeIntervals([
    ...input.occurrences.map((o) => ({ start: o.blockStart, end: o.blockEnd })),
    ...days.flatMap((d) => d.frame.meals),
    ...(input.extraBusy ?? []),
    ...keptBlocks,
  ]);
  const breaks: PlannedSession[] = [];
  for (const s of placed) {
    const brk = { start: s.end, end: s.end + breakMs };
    const nextFocus = allFocus.find((f) => f.start >= s.end && f !== s);
    const soon = nextFocus && nextFocus.start - s.end <= breakMs + 30 * MINUTE;
    if (!soon) continue;
    if (hardAll.some((h) => overlaps(h, brk))) continue;
    if (allFocus.some((f) => overlaps(f, brk))) continue;
    breaks.push({ taskId: null, kind: "break", start: brk.start, end: brk.end });
  }

  const sessions = [...placed, ...breaks].sort((a, b) => a.start - b.start);

  // ---- Diagnostics -------------------------------------------------------------------------
  const unscheduled: UnscheduledTask[] = [];
  const atRisk: AtRiskTask[] = [];
  const taskById = new Map(input.tasks.map((t) => [t.id, t]));

  for (const task of ordered) {
    const rem = remaining.get(task.id) ?? 0;
    const overdue = task.deadline !== null && task.deadline <= now;
    const lastEnd = Math.max(
      0,
      ...placed.filter((p) => p.taskId === task.id).map((p) => p.end),
      ...keptFocus.filter((s) => s.taskId === task.id && s.end > now).map((s) => s.end),
    );
    if (rem > 0) {
      const inHorizon = overdue || (task.deadline !== null && task.deadline <= horizonEnd);
      let reason: UnscheduledTask["reason"];
      let explanation: string;
      if (overdue) {
        reason = "deadline_passed";
        explanation = `The deadline (${fmtDeadline(task.deadline!, tz)}) has passed and there's no free focus time left in this plan for the remaining ${formatDuration(rem)}.`;
      } else if (!inHorizon) {
        reason = "outside_horizon";
        explanation = `${formatDuration(rem)} is left for later — the deadline is after this planning window.`;
      } else if (!task.splittable && rem > Math.max(...days.map((d) => d.capacityMinutes), 0)) {
        reason = "no_slot_long_enough";
        explanation = `This needs one unbroken ${formatDuration(rem)} block, but no day before the deadline has that much realistic focus time.`;
      } else {
        reason = "not_enough_time_before_deadline";
        const deadlineDate = localDateOf(task.deadline!, tz);
        const before = days.filter((d) => daysBetween(d.frame.date, deadlineDate) >= 0);
        const freeBefore = before.reduce((s, d) => s + Math.max(0, d.capacityMinutes - d.usedMinutes), 0);
        explanation =
          `${formatDuration(rem)} more is needed before ${fmtDeadline(task.deadline!, tz)}, ` +
          (freeBefore > 0
            ? `but only ${formatDuration(freeBefore)} of realistic focus time is left in usable blocks after higher-priority work.`
            : `but your focus time before then is already fully booked.`);
      }
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        deadline: task.deadline,
        minutesUnplaced: rem,
        reason,
        explanation,
      });
    } else if (task.deadline !== null && lastEnd > 0) {
      const slack = Math.round((task.deadline - lastEnd) / MINUTE);
      if (slack < AT_RISK_SLACK_MIN) {
        atRisk.push({ taskId: task.id, title: task.title, deadline: task.deadline, slackMinutes: slack });
      }
    }
  }

  const blocking = unscheduled.filter((u) => u.reason !== "outside_horizon");

  const dayLoads: DayLoad[] = days.map((d) => {
    const dueTodayUnplaced = blocking.some((u) => u.deadline !== null && localDateOf(u.deadline, tz) === d.frame.date);
    const ratio = d.capacityMinutes > 0 ? d.usedMinutes / d.capacityMinutes : d.usedMinutes > 0 ? 2 : 0;
    const status: DayLoad["status"] =
      dueTodayUnplaced || ratio > 1.0001 ? "overloaded" : ratio >= 0.9 ? "full" : ratio >= 0.5 ? "balanced" : "light";
    return {
      date: d.frame.date,
      availableMinutes: d.availableMinutes,
      capacityMinutes: d.capacityMinutes,
      plannedMinutes: d.usedMinutes,
      commitmentMinutes: d.commitmentMinutes,
      isRestDay: d.frame.isRestDay,
      status,
    };
  });

  const suggestions = buildSuggestions({ blocking, days, input, placed, taskById, now });

  const spare = days.reduce((s, d) => s + Math.max(0, d.capacityMinutes - d.usedMinutes), 0);
  const plannedTotal = placed.reduce((s, p) => s + durationMin(p), 0);
  let headline: string;
  if (blocking.length > 0) {
    const n = blocking.length;
    headline = `${n} task${n === 1 ? "" : "s"} can't fully fit before ${n === 1 ? "its deadline" : "their deadlines"}. Here are some options.`;
  } else if (plannedTotal === 0 && ordered.length === 0) {
    headline = "No open tasks to plan — enjoy the space.";
  } else if (atRisk.length > 0) {
    headline = `Everything fits, but ${atRisk.length === 1 ? "one deadline is" : `${atRisk.length} deadlines are`} tight.`;
  } else {
    headline = `Everything fits, with about ${formatDuration(spare)} of realistic focus time to spare.`;
  }

  return {
    sessions,
    unscheduled,
    atRisk,
    days: dayLoads,
    suggestions,
    feasible: blocking.length === 0,
    headline,
  };
}

function buildSuggestions(ctx: {
  blocking: UnscheduledTask[];
  days: DayState[];
  input: PlanInput;
  placed: PlannedSession[];
  taskById: Map<string, Task>;
  now: number;
}): Suggestion[] {
  const { blocking, days, input, placed, taskById, now } = ctx;
  const tz = input.timezone;
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (key: string, s: Suggestion) => {
    if (seen.has(key) || out.length >= 8) return;
    seen.add(key);
    out.push(s);
  };

  for (const u of blocking) {
    const task = taskById.get(u.taskId);
    if (!task) continue;
    const deadlineDate = u.deadline !== null && u.deadline > now ? localDateOf(u.deadline, tz) : null;
    const before = deadlineDate ? days.filter((d) => daysBetween(d.frame.date, deadlineDate) >= 0) : days;

    if (!task.splittable) {
      add(`split:${task.id}`, {
        kind: "split_task",
        taskId: task.id,
        title: task.title,
        text: `Allow “${task.title}” to be split into ${input.prefs.sessionMinutes}-minute sessions so it can use shorter gaps.`,
      });
    }

    // Lower-priority work already placed before this deadline could make room.
    const movable = placed
      .filter((p) => p.taskId && (u.deadline === null || p.start < u.deadline))
      .map((p) => taskById.get(p.taskId!))
      .filter((t): t is Task => !!t && t.id !== task.id && PRIORITY_RANK[t.priority] < PRIORITY_RANK[task.priority])
      .filter((t) => t.deadline === null || (u.deadline !== null && t.deadline > u.deadline));
    for (const t of movable.slice(0, 2)) {
      const mins = placed.filter((p) => p.taskId === t.id).reduce((s, p) => s + durationMin(p), 0);
      add(`postpone:${t.id}`, {
        kind: "postpone_task",
        taskId: t.id,
        title: t.title,
        text: `Postpone “${t.title}” (${priorityLabel(t.priority)}) to free up ${formatDuration(mins)} for “${task.title}”.`,
      });
    }

    // Time just outside working hours on days before the deadline.
    let stillNeeded = u.minutesUnplaced;
    for (const d of before) {
      if (stillNeeded <= 0 || !d.frame.work || d.frame.capacityFactor === 0) continue;
      const outside = subtractIntervals(
        { start: Math.max(d.frame.awake.start, ceilToStep(now, STEP_MIN)), end: d.frame.awake.end },
        [d.frame.work],
      );
      const busy = [
        ...occurrencesOnDay(d.frame, input.occurrences).map((o) => ({ start: o.blockStart, end: o.blockEnd })),
        ...d.frame.meals,
      ];
      const extra = outside.flatMap((o) => subtractIntervals(o, busy)).reduce((s, i) => s + durationMin(i), 0);
      const mins = Math.min(extra, 120, stillNeeded);
      if (mins >= 30) {
        const rounded = Math.ceil(mins / STEP_MIN) * STEP_MIN;
        add(`extend:${d.frame.date}`, {
          kind: "extend_hours",
          date: d.frame.date,
          minutes: rounded,
          text: `Stretch your working hours on ${fmtDay(d.frame.date)} by ${formatDuration(rounded)} (only if that feels manageable).`,
        });
        stillNeeded -= rounded;
      }
    }

    for (const d of before) {
      if (d.frame.isWeekend && d.frame.capacityFactor < 1 && d.frame.date >= localDateOf(now, tz)) {
        add(`weekend:${d.frame.date}`, {
          kind: "use_rest_day",
          date: d.frame.date,
          text: `Use part of ${fmtDay(d.frame.date)} for “${task.title}” — it's currently a ${d.frame.isRestDay ? "rest" : "light"} day.`,
        });
        break;
      }
    }

    const optional = input.occurrences.filter(
      (o) => !o.isMandatory && o.start > now && (u.deadline === null || o.end <= u.deadline),
    );
    for (const o of optional.slice(0, 1)) {
      add(`optional:${o.commitmentId}:${o.date}`, {
        kind: "skip_optional",
        commitmentId: o.commitmentId,
        date: o.date,
        title: o.title,
        text: `Consider skipping the optional “${o.title}” on ${fmtDay(o.date)} — only if you decide it's worth it.`,
      });
    }

    if (task.priority !== "low" && u.deadline !== null) {
      add(`extension:${task.id}`, {
        kind: "ask_extension",
        taskId: task.id,
        title: task.title,
        text: `If none of these work, ask for an extension on “${task.title}” or agree a smaller scope.`,
      });
    }
  }
  return out;
}
