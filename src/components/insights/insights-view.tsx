"use client";

import { AlertTriangle, CheckCircle2, FlaskConical, Gauge, PieChart, TimerReset } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DayLoad, Category } from "@/lib/scheduler/types";
import { describeAccuracy, MIN_SAMPLES, type CategoryAccuracy } from "@/lib/reality";
import { formatDuration } from "@/lib/scheduler/time";
import { fmtWeekday } from "@/lib/format";
import { CATEGORY_DOT, CATEGORY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function InsightsView({
  loads,
  today,
  missedThisWeek,
  doneThisWeek,
  completed,
  open,
  accuracy,
  now,
}: {
  loads: DayLoad[];
  today: string;
  missedThisWeek: number;
  doneThisWeek: number;
  completed: { category: Category; completedAt: number }[];
  open: { category: Category; minutes: number }[];
  accuracy: CategoryAccuracy[];
  now: number;
}) {
  const overloaded = loads.filter((l) => l.plannedMinutes > l.capacityMinutes && l.plannedMinutes > 0);
  const maxBar = Math.max(60, ...loads.map((l) => Math.max(l.capacityMinutes, l.plannedMinutes)));
  const last7 = completed.filter((c) => c.completedAt >= now - 7 * 86_400_000).length;

  const openByCat = new Map<Category, number>();
  for (const o of open) openByCat.set(o.category, (openByCat.get(o.category) ?? 0) + o.minutes);
  const openTotal = Array.from(openByCat.values()).reduce((a, b) => a + b, 0);

  const doneByCat = new Map<Category, number>();
  for (const c of completed) doneByCat.set(c.category, (doneByCat.get(c.category) ?? 0) + 1);

  const reliable = accuracy.filter((a) => a.reliable);
  const learning = accuracy.filter((a) => !a.reliable);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-muted-foreground">Patterns from your real data — never guesses.</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Insights</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tasks completed" value={String(last7)} hint="last 7 days" icon={CheckCircle2} />
        <Stat label="Blocks done" value={String(doneThisWeek)} hint="this week" icon={Gauge} />
        <Stat label="Missed blocks" value={String(missedThisWeek)} hint="this week · all recoverable" icon={TimerReset} />
        <Stat label="Open work" value={formatDuration(openTotal)} hint="estimated, still to do" icon={PieChart} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This week&apos;s workload</CardTitle>
          <CardDescription>
            {overloaded.length > 0
              ? `Your planned workload exceeded your realistic capacity on ${overloaded.length} day${overloaded.length === 1 ? "" : "s"} this week.`
              : "Planned work stayed within your realistic capacity every day this week."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-end gap-2 sm:gap-4" role="img" aria-label="Planned focus time versus realistic capacity for each day this week">
            {loads.map((l) => {
              const over = l.plannedMinutes > l.capacityMinutes && l.plannedMinutes > 0;
              return (
                <div key={l.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div className="relative flex h-full w-full max-w-14 items-end justify-center">
                    <div className="absolute bottom-0 w-full rounded-xl border-2 border-dashed border-border" style={{ height: `${(l.capacityMinutes / maxBar) * 100}%` }} />
                    <div
                      className={cn("relative w-3/5 rounded-xl transition-all duration-700", over ? "bg-destructive/70" : "bg-primary/70")}
                      style={{ height: `${(l.plannedMinutes / maxBar) * 100}%` }}
                    />
                  </div>
                  <span className={cn("text-xs", l.date === today ? "font-semibold text-primary" : "text-muted-foreground")}>{fmtWeekday(l.date)}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{formatDuration(l.plannedMinutes)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-primary/70" /> Planned focus
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded border-2 border-dashed border-border" /> Realistic capacity
            </span>
          </div>
          {overloaded.length > 0 && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-strong" />
              Heavier days are where plans usually slip. Next time, try spreading work earlier in the week or lowering what you take on.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-4 text-primary" /> Reality Mode
          </CardTitle>
          <CardDescription>
            When you complete a task, tell Daywise how long it really took. After {MIN_SAMPLES} tasks in a category, it starts suggesting realistic
            estimates.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {reliable.map((a) => (
            <div key={a.category} className="rounded-2xl bg-secondary/60 p-4">
              <p className="font-medium">{describeAccuracy(a, CATEGORY_LABEL[a.category])}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Based on {a.samples} tracked tasks · underestimated {Math.round(a.underestimateRate * 100)}% of the time
              </p>
            </div>
          ))}
          {learning.map((a) => (
            <div key={a.category} className="flex items-center gap-3">
              <span className="w-20 text-sm">{CATEGORY_LABEL[a.category]}</span>
              <Progress value={(a.samples / MIN_SAMPLES) * 100} label={`${CATEGORY_LABEL[a.category]}: ${a.samples} of ${MIN_SAMPLES} tracked tasks`} className="flex-1" />
              <span className="w-24 text-right text-xs text-muted-foreground">
                {a.samples} of {MIN_SAMPLES} tracked
              </span>
            </div>
          ))}
          {accuracy.length === 0 && (
            <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
              No tracked tasks yet. Complete a task and add how long it took — patterns appear once there&apos;s enough data.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open work by category</CardTitle>
          </CardHeader>
          <CardContent>
            {openTotal === 0 ? (
              <p className="text-sm text-muted-foreground">No open work.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {Array.from(openByCat.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, mins]) => (
                    <li key={cat} className="flex items-center gap-3">
                      <span className={cn("size-2.5 rounded-full", CATEGORY_DOT[cat])} aria-hidden />
                      <span className="w-20 text-sm">{CATEGORY_LABEL[cat]}</span>
                      <Progress value={(mins / openTotal) * 100} label={`${CATEGORY_LABEL[cat]} share of open work`} className="flex-1" />
                      <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">{formatDuration(mins)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Completed in the last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            {completed.length === 0 ? (
              <p className="text-sm text-muted-foreground">Completed tasks will show up here.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {Array.from(doneByCat.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, n]) => (
                    <li key={cat} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className={cn("size-2.5 rounded-full", CATEGORY_DOT[cat])} aria-hidden /> {CATEGORY_LABEL[cat]}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Gauge; label: string; value: string; hint: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </Card>
  );
}
