import { z } from "zod";

const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const optionalDate = z.union([date, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
const optionalTime = z.union([time, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null));

export const priority = z.enum(["low", "medium", "high", "urgent"]);
export const category = z.enum(["study", "work", "personal", "health", "errands", "custom"]);
export const timeOfDay = z.enum(["morning", "afternoon", "evening"]);
export const taskStatus = z.enum(["not_started", "in_progress", "completed"]);
export const uuid = z.string().uuid();

export const taskInput = z
  .object({
    title: z.string().trim().min(1, "Give the task a name").max(160),
    description: optionalText(4000),
    estimatedMinutes: z.coerce.number().int().min(5, "At least 5 minutes").max(6000),
    deadlineDate: optionalDate,
    deadlineTime: optionalTime,
    priority,
    category,
    customCategory: optionalText(40),
    splittable: z.boolean(),
    minSessionMinutes: z.coerce.number().int().min(5).max(480),
    earliestStart: optionalDate,
    preferredTime: z.union([timeOfDay, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
    status: taskStatus.optional(),
  })
  .refine((t) => t.category !== "custom" || !!t.customCategory, {
    message: "Name your custom category",
    path: ["customCategory"],
  })
  .refine((t) => !t.deadlineDate || !t.earliestStart || t.earliestStart <= t.deadlineDate, {
    message: "The earliest start must be before the deadline",
    path: ["earliestStart"],
  });
export type TaskInput = z.input<typeof taskInput>;

export const commitmentKind = z.enum([
  "lecture", "seminar", "lab", "work_shift", "meeting", "gym", "appointment", "social", "travel", "personal", "other",
]);

export const recurrenceInput = z
  .object({
    freq: z.enum(["daily", "weekly"]),
    interval: z.coerce.number().int().min(1).max(12),
    byWeekday: z.array(z.number().int().min(0).max(6)).nullable(),
    untilDate: optionalDate,
  })
  .nullable();

export const commitmentInput = z
  .object({
    title: z.string().trim().min(1, "Give it a name").max(120),
    kind: commitmentKind,
    location: optionalText(200),
    startDate: date,
    startTime: time,
    endTime: time,
    recurrence: recurrenceInput,
    travelBeforeMinutes: z.coerce.number().int().min(0).max(240),
    travelAfterMinutes: z.coerce.number().int().min(0).max(240),
    isMandatory: z.boolean(),
    notes: optionalText(2000),
  })
  .refine((c) => c.startTime !== c.endTime, { message: "Start and end can't be the same", path: ["endTime"] })
  .refine((c) => !c.recurrence?.untilDate || c.recurrence.untilDate >= c.startDate, {
    message: "The repeat end date must be after the first date",
    path: ["recurrence"],
  });
export type CommitmentInput = z.input<typeof commitmentInput>;

export const preferencesInput = z.object({
  displayName: z.string().trim().min(1, "What should we call you?").max(80),
  userType: z.enum(["student", "working"]),
  timezone: z.string().min(1).max(64),
  wakeTime: time,
  bedTime: time,
  workStart: time,
  workEnd: time,
  breakfastTime: optionalTime,
  lunchTime: optionalTime,
  dinnerTime: optionalTime,
  mealMinutes: z.coerce.number().int().min(10).max(120),
  breakMinutes: z.coerce.number().int().min(5).max(60),
  focusPreference: timeOfDay,
  maxFocusMinutes: z.coerce.number().int().min(30).max(720),
  sessionMinutes: z.coerce.number().int().min(15).max(240),
  weekendMode: z.enum(["work", "light", "rest"]),
  bufferPercent: z.coerce.number().int().min(0).max(50),
  windDownMinutes: z.coerce.number().int().min(0).max(180),
})
  .refine((p) => p.wakeTime !== p.bedTime, { message: "Wake-up and bedtime can't be the same", path: ["bedTime"] })
  .refine((p) => p.workStart !== p.workEnd, { message: "Working hours need a length", path: ["workEnd"] });
export type PreferencesInput = z.input<typeof preferencesInput>;

export function firstIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  return issue ? issue.message : "Please check the form.";
}
