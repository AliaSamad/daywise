import type { Category } from "@/lib/scheduler/types";

/** Minimum tracked tasks in a category before Daywise says anything about it. */
export const MIN_SAMPLES = 5;

export interface EntryLike {
  minutes: number;
  estimated_minutes: number | null;
  category: Category;
}

export interface CategoryAccuracy {
  category: Category;
  samples: number;
  /** Median actual ÷ estimate. 1.35 means "usually takes 35% longer". */
  medianRatio: number;
  /** Share of tasks that took longer than estimated. */
  underestimateRate: number;
  reliable: boolean;
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function categoryAccuracy(entries: EntryLike[]): CategoryAccuracy[] {
  const byCat = new Map<Category, { ratios: number[]; over: number }>();
  for (const e of entries) {
    if (!e.estimated_minutes || e.estimated_minutes <= 0 || e.minutes <= 0) continue;
    const b = byCat.get(e.category) ?? { ratios: [], over: 0 };
    const ratio = e.minutes / e.estimated_minutes;
    b.ratios.push(ratio);
    if (ratio > 1.05) b.over += 1;
    byCat.set(e.category, b);
  }
  return Array.from(byCat.entries())
    .map(([category, b]) => ({
      category,
      samples: b.ratios.length,
      medianRatio: median(b.ratios),
      underestimateRate: b.over / b.ratios.length,
      reliable: b.ratios.length >= MIN_SAMPLES,
    }))
    .sort((a, b) => b.samples - a.samples);
}

/**
 * A suggested estimate for a new task, or null when there isn't enough data or the
 * user's estimates are already within 10%.
 */
export function suggestEstimate(estimate: number, acc: CategoryAccuracy | undefined): number | null {
  if (!acc || !acc.reliable) return null;
  if (Math.abs(acc.medianRatio - 1) < 0.1) return null;
  return Math.max(5, Math.round((estimate * acc.medianRatio) / 5) * 5);
}

export function describeAccuracy(acc: CategoryAccuracy, label: string): string {
  const pct = Math.round(Math.abs(acc.medianRatio - 1) * 100);
  if (pct < 10) return `Your ${label.toLowerCase()} estimates are usually spot on.`;
  return acc.medianRatio > 1
    ? `You usually need ${pct}% more time for ${label.toLowerCase()} tasks than you first estimate.`
    : `You usually finish ${label.toLowerCase()} tasks ${pct}% faster than you estimate.`;
}
