import type { PrefsRow, ProfileRow } from "@/lib/data/rows";
import { hhmm } from "@/lib/data/mappers";
import type { PrefsValue } from "./fields";

export function prefsValueFrom(profile: ProfileRow, prefs: PrefsRow, fallbackName = ""): PrefsValue {
  const t = (v: string | null) => (v ? hhmm(v) : null);
  return {
    displayName: profile.display_name || fallbackName,
    userType: profile.user_type,
    timezone: profile.timezone,
    wakeTime: hhmm(prefs.wake_time),
    bedTime: hhmm(prefs.bed_time),
    workStart: hhmm(prefs.work_start),
    workEnd: hhmm(prefs.work_end),
    breakfastTime: t(prefs.breakfast_time),
    lunchTime: t(prefs.lunch_time),
    dinnerTime: t(prefs.dinner_time),
    mealMinutes: prefs.meal_minutes,
    breakMinutes: prefs.break_minutes,
    focusPreference: prefs.focus_preference,
    maxFocusMinutes: prefs.max_focus_minutes,
    sessionMinutes: prefs.session_minutes,
    weekendMode: prefs.weekend_mode,
    bufferPercent: prefs.buffer_percent,
    windDownMinutes: prefs.wind_down_minutes,
  };
}
