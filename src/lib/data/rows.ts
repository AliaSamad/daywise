/** Row shapes as returned by Supabase (snake_case, times as strings). */

export interface ProfileRow {
  id: string;
  display_name: string;
  user_type: "student" | "working";
  timezone: string;
  onboarded_at: string | null;
}

export interface PrefsRow {
  user_id: string;
  wake_time: string;
  bed_time: string;
  work_start: string;
  work_end: string;
  breakfast_time: string | null;
  lunch_time: string | null;
  dinner_time: string | null;
  meal_minutes: number;
  break_minutes: number;
  focus_preference: "morning" | "afternoon" | "evening";
  max_focus_minutes: number;
  session_minutes: number;
  weekend_mode: "work" | "light" | "rest";
  buffer_percent: number;
  wind_down_minutes: number;
}

export interface RecurrenceRow {
  id: string;
  freq: "daily" | "weekly";
  interval: number;
  by_weekday: number[] | null;
  until_date: string | null;
}

export interface CommitmentRow {
  id: string;
  title: string;
  kind: string;
  location: string | null;
  start_date: string;
  start_time: string;
  end_time: string;
  timezone: string;
  recurrence_rule_id: string | null;
  travel_before_minutes: number;
  travel_after_minutes: number;
  is_mandatory: boolean;
  notes: string | null;
  is_demo: boolean;
  recurrence_rules: RecurrenceRow | null;
  commitment_exceptions: { occurrence_date: string }[];
}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  estimated_minutes: number;
  deadline: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  category: "study" | "work" | "personal" | "health" | "errands" | "custom";
  custom_category: string | null;
  splittable: boolean;
  min_session_minutes: number;
  earliest_start: string | null;
  preferred_time: "morning" | "afternoon" | "evening" | null;
  status: "not_started" | "in_progress" | "completed";
  completed_at: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface SessionRow {
  id: string;
  task_id: string | null;
  kind: "task" | "break";
  start_at: string;
  end_at: string;
  status: "planned" | "done" | "skipped";
  locked: boolean;
}

export interface TimeEntryRow {
  id: string;
  task_id: string;
  minutes: number;
  estimated_minutes: number | null;
  category: TaskRow["category"];
  started_at: string | null;
  created_at: string;
}

export const COMMITMENT_SELECT =
  "id,title,kind,location,start_date,start_time,end_time,timezone,recurrence_rule_id,travel_before_minutes,travel_after_minutes,is_mandatory,notes,is_demo,recurrence_rules(id,freq,interval,by_weekday,until_date),commitment_exceptions(occurrence_date)";
export const TASK_SELECT =
  "id,title,description,estimated_minutes,deadline,priority,category,custom_category,splittable,min_session_minutes,earliest_start,preferred_time,status,completed_at,is_demo,created_at";
export const SESSION_SELECT = "id,task_id,kind,start_at,end_at,status,locked";
export const PREFS_SELECT =
  "user_id,wake_time,bed_time,work_start,work_end,breakfast_time,lunch_time,dinner_time,meal_minutes,break_minutes,focus_preference,max_focus_minutes,session_minutes,weekend_mode,buffer_percent,wind_down_minutes";
