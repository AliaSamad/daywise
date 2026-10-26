import { addDaysLocal, startOfWeekLocal, weekdayOf, zonedInstant, type LocalDate } from "@/lib/scheduler/time";

/**
 * Sample data for exploring Daywise. Generated relative to "today" and inserted with
 * is_demo = true so it can be removed without touching anything the user created.
 */
export function buildDemoData(today: LocalDate, tz: string) {
  const monday = startOfWeekLocal(today);
  const day = (offset: number) => addDaysLocal(today, offset);
  const deadline = (offset: number, time = "23:59") => new Date(zonedInstant(day(offset), time, tz)).toISOString();
  // A Saturday that's still ahead of us (or today).
  const saturday = addDaysLocal(today, (6 - weekdayOf(today) + 7) % 7);

  const commitments = [
    {
      title: "Algorithms lecture",
      kind: "lecture",
      location: "Main Building, Room 2.14",
      start_date: monday,
      start_time: "10:00",
      end_time: "12:00",
      travel_before_minutes: 20,
      travel_after_minutes: 15,
      is_mandatory: true,
      rule: { freq: "weekly", interval: 1, by_weekday: [1, 3], until_date: null },
    },
    {
      title: "Statistics seminar",
      kind: "seminar",
      location: "Library seminar room",
      start_date: monday,
      start_time: "14:00",
      end_time: "15:00",
      travel_before_minutes: 10,
      travel_after_minutes: 10,
      is_mandatory: true,
      rule: { freq: "weekly", interval: 1, by_weekday: [2], until_date: null },
    },
    {
      title: "Café shift",
      kind: "work_shift",
      location: "Bean There",
      start_date: monday,
      start_time: "17:00",
      end_time: "21:00",
      travel_before_minutes: 15,
      travel_after_minutes: 15,
      is_mandatory: true,
      rule: { freq: "weekly", interval: 1, by_weekday: [4], until_date: null },
    },
    {
      title: "Yoga class",
      kind: "gym",
      location: "Sports centre",
      start_date: saturday,
      start_time: "10:00",
      end_time: "11:00",
      travel_before_minutes: 15,
      travel_after_minutes: 15,
      is_mandatory: false,
      rule: null,
    },
    {
      title: "Dentist",
      kind: "appointment",
      location: "High Street Dental",
      start_date: day(2),
      start_time: "09:00",
      end_time: "09:30",
      travel_before_minutes: 15,
      travel_after_minutes: 15,
      is_mandatory: true,
      rule: null,
    },
  ];

  const tasks = [
    { title: "History essay", estimated_minutes: 300, deadline: deadline(3), priority: "high", category: "study", splittable: true, min_session_minutes: 30, description: "2,000 words on the Industrial Revolution." },
    { title: "Coding assignment", estimated_minutes: 120, deadline: deadline(1, "17:00"), priority: "high", category: "study", splittable: true, min_session_minutes: 30, description: null },
    { title: "Read chapter 6", estimated_minutes: 90, deadline: deadline(5), priority: "medium", category: "study", splittable: true, min_session_minutes: 25, description: null },
    { title: "Buy groceries", estimated_minutes: 45, deadline: null, priority: "medium", category: "errands", splittable: false, min_session_minutes: 45, description: null },
    { title: "Exam revision", estimated_minutes: 240, deadline: deadline(9), priority: "medium", category: "study", splittable: true, min_session_minutes: 30, description: null },
    { title: "Call the landlord about the boiler", estimated_minutes: 15, deadline: deadline(2, "17:00"), priority: "low", category: "personal", splittable: false, min_session_minutes: 15, description: null },
  ];

  return { commitments, tasks };
}
