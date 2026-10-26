import type { Category, Priority } from "@/lib/scheduler/types";

export const CATEGORY_LABEL: Record<Category, string> = {
  study: "Study",
  work: "Work",
  personal: "Personal",
  health: "Health",
  errands: "Errands",
  custom: "Custom",
};

/** Tailwind classes for a small category dot. */
export const CATEGORY_DOT: Record<Category, string> = {
  study: "bg-primary",
  work: "bg-blue",
  personal: "bg-[oklch(0.7_0.09_350)]",
  health: "bg-sage",
  errands: "bg-warning",
  custom: "bg-muted-foreground",
};

export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
export const PRIORITY_BADGE: Record<Priority, "secondary" | "blue" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "blue",
  high: "warning",
  urgent: "destructive",
};

export const STATUS_LABEL = { not_started: "Not started", in_progress: "In progress", completed: "Completed" } as const;

export const COMMITMENT_KIND_LABEL: Record<string, string> = {
  lecture: "Lecture",
  seminar: "Seminar",
  lab: "Lab",
  work_shift: "Work shift",
  meeting: "Meeting",
  gym: "Gym / class",
  appointment: "Appointment",
  social: "Social",
  travel: "Travel / commute",
  personal: "Personal time",
  other: "Other",
};

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Monday-first order of weekday indexes (0 = Sunday). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
