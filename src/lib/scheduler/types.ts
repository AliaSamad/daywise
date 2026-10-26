import type { Interval, LocalDate, LocalTime } from "./time";

export type TimeOfDay = "morning" | "afternoon" | "evening";
export type WeekendMode = "work" | "light" | "rest";
export type Priority = "low" | "medium" | "high" | "urgent";
export type Category = "study" | "work" | "personal" | "health" | "errands" | "custom";
export type TaskStatus = "not_started" | "in_progress" | "completed";

export interface SchedulingPrefs {
  wakeTime: LocalTime;
  bedTime: LocalTime;
  workStart: LocalTime;
  workEnd: LocalTime;
  breakfastTime: LocalTime | null;
  lunchTime: LocalTime | null;
  dinnerTime: LocalTime | null;
  mealMinutes: number;
  breakMinutes: number;
  focusPreference: TimeOfDay;
  maxFocusMinutes: number;
  sessionMinutes: number;
  weekendMode: WeekendMode;
  bufferPercent: number;
  windDownMinutes: number;
}

export interface RecurrenceRule {
  freq: "daily" | "weekly";
  interval: number;
  byWeekday: number[] | null; // 0 = Sunday
  untilDate: LocalDate | null;
}

export interface Commitment {
  id: string;
  title: string;
  kind: string;
  location: string | null;
  startDate: LocalDate;
  startTime: LocalTime;
  endTime: LocalTime;
  timezone: string;
  recurrence: RecurrenceRule | null;
  travelBeforeMinutes: number;
  travelAfterMinutes: number;
  isMandatory: boolean;
  exceptions: LocalDate[];
}

export interface CommitmentOccurrence {
  commitmentId: string;
  title: string;
  kind: string;
  location: string | null;
  isMandatory: boolean;
  date: LocalDate; // local date the occurrence starts on
  start: number;
  end: number;
  /** Including travel time before and after. */
  blockStart: number;
  blockEnd: number;
}

export interface Task {
  id: string;
  title: string;
  estimatedMinutes: number;
  deadline: number | null; // epoch ms
  priority: Priority;
  category: Category;
  splittable: boolean;
  minSessionMinutes: number;
  earliestStart: LocalDate | null;
  preferredTime: TimeOfDay | null;
  status: TaskStatus;
}

export interface ExistingSession {
  id: string;
  taskId: string | null;
  kind: "task" | "break";
  start: number;
  end: number;
  status: "planned" | "done" | "skipped";
  locked: boolean;
}

export interface PlannedSession {
  taskId: string | null;
  kind: "task" | "break";
  start: number;
  end: number;
}

export type UnscheduledReason =
  | "deadline_passed"
  | "not_enough_time_before_deadline"
  | "no_slot_long_enough"
  | "outside_horizon";

export interface UnscheduledTask {
  taskId: string;
  title: string;
  priority: Priority;
  deadline: number | null;
  /** Minutes that could not be placed. */
  minutesUnplaced: number;
  reason: UnscheduledReason;
  explanation: string;
}

export interface AtRiskTask {
  taskId: string;
  title: string;
  deadline: number;
  /** Minutes between the end of the final session and the deadline. */
  slackMinutes: number;
}

export interface DayLoad {
  date: LocalDate;
  /** Free minutes inside the working window after commitments and meals. */
  availableMinutes: number;
  /** Realistic focus capacity after buffer and max-focus caps. */
  capacityMinutes: number;
  plannedMinutes: number;
  commitmentMinutes: number;
  isRestDay: boolean;
  status: "light" | "balanced" | "full" | "overloaded";
}

export type Suggestion =
  | { kind: "split_task"; taskId: string; title: string; text: string }
  | { kind: "postpone_task"; taskId: string; title: string; text: string }
  | { kind: "extend_hours"; date: LocalDate; minutes: number; text: string }
  | { kind: "use_rest_day"; date: LocalDate; text: string }
  | { kind: "skip_optional"; commitmentId: string; date: LocalDate; title: string; text: string }
  | { kind: "ask_extension"; taskId: string; title: string; text: string };

export interface PlanInput {
  now: number;
  timezone: string;
  /** Local dates to plan, in order. */
  days: LocalDate[];
  prefs: SchedulingPrefs;
  tasks: Task[];
  occurrences: CommitmentOccurrence[];
  /** Sessions already in the calendar (any status). */
  existingSessions: ExistingSession[];
  /** Additional busy time that is not a commitment (e.g. protected personal events). */
  extraBusy?: Interval[];
  /** Minutes of task work already completed, by task id. */
  completedMinutes?: Record<string, number>;
}

export interface PlanResult {
  sessions: PlannedSession[];
  unscheduled: UnscheduledTask[];
  atRisk: AtRiskTask[];
  days: DayLoad[];
  suggestions: Suggestion[];
  feasible: boolean;
  /** Human readable headline, e.g. "Everything fits with 1h 20m to spare". */
  headline: string;
}
