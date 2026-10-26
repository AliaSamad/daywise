import { addDaysLocal, weekdayOf, type LocalDate } from "@/lib/scheduler/time";
import type { Category, Priority } from "@/lib/scheduler/types";

/**
 * Deterministic natural-language task parser. Turns a sentence such as
 * "an essay due Thursday that will take about 5 hours, and I need to buy groceries"
 * into draft tasks the user reviews and edits before saving.
 */
export interface ParsedTask {
  title: string;
  estimatedMinutes: number;
  /** True when no duration was mentioned and we used a category default. */
  durationGuessed: boolean;
  deadlineDate: LocalDate | null;
  deadlineTime: string | null; // HH:mm
  priority: Priority;
  category: Category;
  source: string;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const CATEGORY_KEYWORDS: [Category, RegExp][] = [
  ["study", /\b(essay|assignment|coursework|homework|revis\w*|reading|read|lecture|seminar|lab report|dissertation|thesis|exam|quiz|study|problem set|coding|code|programming|project|notes|flashcards)\b/],
  ["work", /\b(report|email|emails|meeting prep|presentation|slides|deck|client|invoice|timesheet|proposal|review|deploy|work)\b/],
  ["errands", /\b(buy|groceries|grocery|shopping|shop|pick up|collect|post office|bank|return|drop off|pharmacy|laundry|errand)\b/],
  ["health", /\b(gym|run|running|workout|yoga|swim|doctor|dentist|physio|meditat\w*|walk)\b/],
  ["personal", /\b(call|clean|tidy|cook|book|pay|plan|organis\w*|organiz\w*|birthday|gift)\b/],
];

const DEFAULT_MINUTES: Record<Category, number> = {
  study: 60,
  work: 60,
  errands: 30,
  health: 45,
  personal: 30,
  custom: 30,
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, fortyfive: 45, ninety: 90,
};

function num(token: string): number | null {
  const t = token.toLowerCase();
  if (t in NUMBER_WORDS) return NUMBER_WORDS[t];
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Split a paragraph into one clause per task. */
export function splitClauses(text: string): string[] {
  return text
    .replace(/[ \t]+/g, " ")
    .split(/\n|;|•|(?:,\s*(?:and\s+)?)|(?:\.\s+)|(?:\s+and\s+(?!a half)(?=(?:i\s|i'|also\s|then\s|a\s|an\s|my\s|to\s|need\s|have\s|must\s|should\s)))/i)
    .map((c) => c.trim().replace(/[.!]+$/, "").trim())
    .filter((c) => c.length > 1);
}

interface Extracted {
  minutes: number | null;
  rest: string;
}

function extractDuration(clause: string): Extracted {
  const patterns: [RegExp, (m: RegExpExecArray) => number | null][] = [
    [/\b(?:about|around|roughly|approx(?:imately)?|maybe|~)?\s*half an? hour\b/i, () => 30],
    [/\b(?:about|around|roughly|approx(?:imately)?|maybe|~)?\s*(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:and a half|½)\s*(?:hours?|hrs?|h)\b/i,
      (m) => { const n = num(m[1]); return n === null ? null : (n + 0.5) * 60; }],
    [/\b(?:about|around|roughly|approx(?:imately)?|maybe|~)?\s*(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:hours?|hrs?)\s+and a half\b/i,
      (m) => { const n = num(m[1]); return n === null ? null : (n + 0.5) * 60; }],
    [/\b(?:about|around|roughly|approx(?:imately)?|maybe|~)?\s*(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\s*(?:and\s*)?(\d+)\s*(?:m|mins?|minutes?)\b/i,
      (m) => Number(m[1]) * 60 + Number(m[2])],
    [/\b(?:about|around|roughly|approx(?:imately)?|maybe|~)?\s*(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:h|hr|hrs|hours?)\b/i,
      (m) => { const n = num(m[1]); return n === null ? null : n * 60; }],
    [/\b(?:about|around|roughly|approx(?:imately)?|maybe|~)?\s*(\d+|ten|fifteen|twenty|thirty|forty|forty-five|ninety)\s*(?:m|mins?|minutes?)\b/i,
      (m) => num(m[1])],
  ];
  for (const [re, fn] of patterns) {
    const m = re.exec(clause);
    if (!m) continue;
    const minutes = fn(m);
    if (minutes === null || minutes <= 0) continue;
    // Also strip any lead-in like "that will take", "which takes", "takes", "for".
    const rest = clause
      .replace(m[0], " ")
      .replace(/\b(?:that|which)?\s*(?:will|should|would|might)?\s*(?:take|takes|taking|last|lasts)\s*(?:me)?\s*(?:about|around)?\s*$/i, " ")
      .replace(/\b(?:that|which)\s*(?:will|should|would|might)?\s*(?:take|takes|taking)\s*(?:me)?\b/i, " ")
      .replace(/\bfor\s*$/i, " ");
    return { minutes: Math.round(minutes), rest };
  }
  return { minutes: null, rest: clause };
}

interface DeadlineExtract {
  date: LocalDate | null;
  time: string | null;
  rest: string;
}

function parseClock(h: string, m: string | undefined, ampm: string | undefined): string | null {
  let hour = Number(h);
  const minute = m ? Number(m) : 0;
  if (ampm) {
    const pm = ampm.toLowerCase().startsWith("p");
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function extractDeadline(clause: string, today: LocalDate): DeadlineExtract {
  let rest = clause;
  let date: LocalDate | null = null;
  let time: string | null = null;
  const lead = String.raw`(?:due(?:\s+(?:on|by))?|by|before|on|for|until)?\s*`;

  const timeRe = /\b(?:at|by|before)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at|by|before)\s+(\d{1,2}):(\d{2})\b|\b(noon|midday|midnight)\b/i;
  const tm = timeRe.exec(rest);
  if (tm) {
    if (tm[6]) time = tm[6].toLowerCase() === "midnight" ? "23:59" : "12:00";
    else if (tm[1]) time = parseClock(tm[1], tm[2], tm[3]);
    else time = parseClock(tm[4], tm[5], undefined);
    if (time) rest = rest.replace(tm[0], " ");
  }

  const rules: [RegExp, (m: RegExpExecArray) => LocalDate | null][] = [
    [new RegExp(String.raw`\b${lead}(today|tonight|this evening)\b`, "i"), () => today],
    [new RegExp(String.raw`\b${lead}(tomorrow|tmrw|tmr)\b`, "i"), () => addDaysLocal(today, 1)],
    [new RegExp(String.raw`\b${lead}(?:the\s+)?day after tomorrow\b`, "i"), () => addDaysLocal(today, 2)],
    [new RegExp(String.raw`\b${lead}in\s+(\d+|a|one|two|three|four|five|six|seven|ten)\s+(day|days|week|weeks)\b`, "i"),
      (m) => { const n = num(m[1]) ?? 1; return addDaysLocal(today, m[2].toLowerCase().startsWith("week") ? n * 7 : n); }],
    [new RegExp(String.raw`\b${lead}(?:the\s+)?end of (?:the\s+)?week\b`, "i"), () => {
      const wd = weekdayOf(today); return addDaysLocal(today, (5 - wd + 7) % 7);
    }],
    [new RegExp(String.raw`\b${lead}next week\b`, "i"), () => {
      const wd = weekdayOf(today); return addDaysLocal(today, ((1 - wd + 7) % 7 || 7) + 4);
    }],
    [new RegExp(String.raw`\b${lead}(next\s+|this\s+)?(${WEEKDAYS.join("|")}|${WEEKDAY_SHORT.join("|")})\b`, "i"), (m) => {
      const word = m[2].toLowerCase().slice(0, 3);
      const target = WEEKDAY_SHORT.indexOf(word);
      const wd = weekdayOf(today);
      let diff = (target - wd + 7) % 7;
      if (diff === 0) diff = 7; // "Monday" said on a Monday means next Monday
      // "next Friday" skips the Friday of the current Monday–Sunday week.
      const daysToSunday = (7 - wd) % 7;
      if (m[1]?.trim().toLowerCase() === "next" && diff <= daysToSunday) diff += 7;
      return addDaysLocal(today, diff);
    }],
    [new RegExp(String.raw`\b${lead}(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${MONTHS.join("|")})[a-z]*\b`, "i"), (m) =>
      resolveMonthDay(today, MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)), Number(m[1]))],
    [new RegExp(String.raw`\b${lead}(${MONTHS.join("|")})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b`, "i"), (m) =>
      resolveMonthDay(today, MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)), Number(m[2]))],
    [new RegExp(String.raw`\b${lead}(\d{1,2})/(\d{1,2})\b`, "i"), (m) => resolveMonthDay(today, Number(m[2]) - 1, Number(m[1]))],
  ];
  for (const [re, fn] of rules) {
    const m = re.exec(rest);
    if (!m) continue;
    const d = fn(m);
    if (!d) continue;
    date = d;
    rest = rest.replace(m[0], " ");
    break;
  }
  if (date && !time) time = /\btonight|this evening\b/i.test(clause) ? "21:00" : "23:59";
  if (!date && time) date = today;
  return { date, time, rest };
}

function resolveMonthDay(today: LocalDate, monthIndex: number, day: number): LocalDate | null {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  let candidate = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
  if (Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) || new Date(`${candidate}T00:00:00Z`).getUTCDate() !== day) return null;
  if (candidate < today) candidate = `${year + 1}-${pad(monthIndex + 1)}-${pad(day)}`;
  return candidate;
}

function extractPriority(clause: string): { priority: Priority | null; rest: string } {
  const rules: [Priority, RegExp][] = [
    ["urgent", /\b(urgent(?:ly)?|asap|immediately|right away|critical)\b/i],
    ["high", /\b(important|high priority|top priority|must)\b/i],
    ["low", /\b(low priority|whenever|if i have time|eventually|no rush|sometime)\b/i],
  ];
  for (const [p, re] of rules) {
    if (re.test(clause)) return { priority: p, rest: clause.replace(re, " ") };
  }
  return { priority: null, rest: clause };
}

function detectCategory(clause: string): Category {
  const lower = clause.toLowerCase();
  for (const [cat, re] of CATEGORY_KEYWORDS) if (re.test(lower)) return cat;
  return "personal";
}

function cleanTitle(raw: string): string {
  let t = raw
    .replace(/\s+/g, " ")
    .replace(/^(?:and|also|then|plus|oh)\s+/i, "")
    .replace(/^(?:i\s+(?:also\s+)?(?:have|need|must|should|want|gotta|got)\s+(?:to\s+)?(?:do\s+|finish\s+|write\s+(?=an?\s))?)/i, "")
    .replace(/^(?:i've got|i have got|there's|there is|remember to|don't forget to|need to|have to|must|should|todo:?|to do:?)\s+/i, "")
    .replace(/^(?:an?|the|my)\s+/i, "")
    .replace(/\b(?:that|which)\s+(?:is\s+)?(?:will|should|would|might)?\s*(?:take|takes)?\s*$/i, "")
    .replace(/\b(?:that|which|it)\s*(?:is|'s)?\s*$/i, "")
    .replace(/\b(?:due|by|before|on|for|at|is|and)\s*$/i, "")
    .replace(/\s+(?:that|which)\s+(?:is\s+)?(?:due)?\s*$/i, "")
    .replace(/[,\-–:]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  // Run the trailing-word strip twice to catch "that is due".
  t = t.replace(/\b(?:that|which|due|is|by|on)\s*$/i, "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function parseTasks(text: string, today: LocalDate): ParsedTask[] {
  const out: ParsedTask[] = [];
  for (const clause of splitClauses(text)) {
    const d = extractDuration(clause);
    const dl = extractDeadline(d.rest, today);
    const pr = extractPriority(dl.rest);
    const title = cleanTitle(pr.rest);
    if (!title || title.length < 2) continue;
    const category = detectCategory(clause);
    let priority: Priority = pr.priority ?? "medium";
    if (!pr.priority && dl.date) {
      const days = Math.round((Date.parse(dl.date) - Date.parse(today)) / 86_400_000);
      if (days <= 1) priority = "high";
    }
    out.push({
      title: title.slice(0, 160),
      estimatedMinutes: Math.min(6000, Math.max(5, d.minutes ?? DEFAULT_MINUTES[category])),
      durationGuessed: d.minutes === null,
      deadlineDate: dl.date,
      deadlineTime: dl.date ? dl.time : null,
      priority,
      category,
      source: clause,
    });
  }
  return out;
}
