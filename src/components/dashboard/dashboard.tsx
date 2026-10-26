"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Coffee,
  Flag,
  Hourglass,
  ListPlus,
  Loader2,
  Sparkles,
  Sunrise,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";
import { loadDemoData } from "@/app/actions/demo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useApp } from "@/components/app-context";
import { TimeGrid } from "@/components/calendar/time-grid";
import { PlanButton } from "@/components/planner/plan-button";
import { ReplanButton } from "@/components/planner/replan-dialog";
import type { CalendarItem } from "@/lib/calendar/items";
import type { DashboardSummary } from "@/lib/dashboard";
import { formatDuration } from "@/lib/scheduler/time";
import { fmtDayLong, fmtDeadline, fmtRange, fmtTime, relative } from "@/lib/format";
import { CATEGORY_DOT, PRIORITY_BADGE, PRIORITY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

function greeting(now: number, tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(now));
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Dashboard({
  name,
  now: serverNow,
  today,
  items,
  summary,
  tasks,
  isEmpty,
}: {
  name: string;
  now: number;
  today: string;
  items: CalendarItem[];
  summary: DashboardSummary;
  tasks: { id: string; title: string; estimatedMinutes: number }[];
  plannedFuture: Record<string, number>;
  isEmpty: boolean;
}) {
  const { tz, setQuickAddOpen } = useApp();
  const router = useRouter();
  const [now, setNow] = useState(serverNow);

  // Keep "right now" honest without reloading data constantly.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const r = setInterval(() => router.refresh(), 5 * 60_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [router]);

  if (isEmpty) return <Welcome name={name} today={today} now={now} />;

  const s = summary;
  const progressPct = s.progress.plannedMinutes ? (s.progress.doneMinutes / s.progress.plannedMinutes) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="animate-rise">
          <p className="text-sm text-muted-foreground">{fmtDayLong(today)}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {greeting(now, tz)}, {name}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <PlanButton scope="day" size="lg" />
          <ReplanButton size="lg" openTasks={tasks} />
          <Button variant="ghost" size="lg" className="hidden sm:inline-flex lg:hidden" onClick={() => setQuickAddOpen(true)}>
            <ListPlus /> Add
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <NowCard current={s.current} next={s.next} now={now} tz={tz} />
        <FeasibilityCard summary={s} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Clock} label="Free time left" value={formatDuration(s.freeMinutes)} hint="after commitments & meals" />
        <Stat icon={Hourglass} label="Still to do" value={formatDuration(s.workloadMinutes)} hint="planned work + commitments" />
        <Stat icon={CheckCircle2} label="Tasks completed" value={String(s.progress.tasksCompletedToday)} hint="today" />
        <Card className="flex flex-col justify-between gap-2 p-4">
          <p className="text-xs font-medium text-muted-foreground">Today&apos;s progress</p>
          <p className="text-xl font-semibold tabular-nums">{Math.round(progressPct)}%</p>
          <Progress value={progressPct} label="Share of today's planned work done" indicatorClassName="bg-sage" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Today&apos;s timeline</CardTitle>
              <CardDescription>Drag task blocks to adjust. Tap a block for options.</CardDescription>
            </div>
            <Legend />
          </CardHeader>
          <CardContent className="pr-3">
            <TimeGrid days={[today]} items={items} now={now} tasks={tasks} className="h-[min(70dvh,640px)]" />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="size-4 text-primary" /> Top priorities
              </CardTitle>
            </CardHeader>
            <CardContent>
              {s.top.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing open — lovely.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {s.top.map(({ task, remaining, scheduledToday }, i) => (
                    <li key={task.id} className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-medium">
                          <span className={cn("size-2 shrink-0 rounded-full", CATEGORY_DOT[task.category])} aria-hidden />
                          <span className="truncate">{task.title}</span>
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <Badge variant={PRIORITY_BADGE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
                          {task.deadline && <span className={cn(task.deadline < now && "text-destructive")}>{task.deadline < now ? "Overdue · was due" : "Due"} {fmtDeadline(task.deadline, tz)}</span>}
                          <span>{formatDuration(remaining)} left</span>
                          {scheduledToday > 0 && <span className="text-sage-strong">{formatDuration(scheduledToday)} today</span>}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <Link href="/tasks" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                All tasks <ArrowRight className="size-3.5" />
              </Link>
            </CardContent>
          </Card>

          {s.missed.length > 0 && (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-destructive" /> Missed blocks
                </CardTitle>
                <CardDescription>No stress — the work hasn&apos;t gone anywhere. Replan to fit it back in.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {s.missed.slice(0, 4).map((m) => (
                    <li key={m.key} className="flex justify-between gap-2">
                      <span className="truncate font-medium">{m.title}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{fmtRange(m.start, m.end, tz)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {s.unscheduledToday.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Could use time today</CardTitle>
                <CardDescription>Not on your calendar yet.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="mb-3 flex flex-col gap-1.5 text-sm">
                  {s.unscheduledToday.map((u) => (
                    <li key={u.taskId} className="flex justify-between gap-2">
                      <span className="truncate">{u.title}</span>
                      <span className="shrink-0 text-muted-foreground">{formatDuration(u.minutes)}</span>
                    </li>
                  ))}
                </ul>
                <PlanButton scope="day" variant="secondary" className="w-full" />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function NowCard({ current, next, now, tz }: { current: CalendarItem | null; next: CalendarItem | null; now: number; tz: string }) {
  const icon = (i: CalendarItem) =>
    i.type === "break" ? Coffee : i.type === "meal" ? Utensils : i.type === "commitment" ? CalendarPlus : Sparkles;
  const CurIcon = current ? icon(current) : Sunrise;
  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-secondary via-card to-card p-6">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/15 blur-2xl" />
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Right now</p>
      {current ? (
        <div className="mt-2 flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-card shadow-soft">
            <CurIcon className="size-5 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-2xl font-semibold leading-tight">{current.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {fmtRange(current.start, current.end, tz)} · ends {relative(current.end, now)}
              {current.location ? ` · ${current.location}` : ""}
            </p>
            <Progress
              className="mt-3 max-w-xs"
              value={((now - current.start) / (current.end - current.start)) * 100}
              label="Time elapsed in the current block"
            />
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <p className="font-display text-2xl font-semibold">Free time</p>
          <p className="mt-1 text-sm text-muted-foreground">Nothing scheduled right now. Rest, or pick something from your priorities.</p>
        </div>
      )}
      <div className="mt-5 border-t border-border/70 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Up next</p>
        {next ? (
          <p className="mt-1 text-sm">
            <span className="font-medium">{next.title}</span>{" "}
            <span className="text-muted-foreground">
              at {fmtTime(next.start, tz)} ({relative(next.start, now)})
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Nothing else today.</p>
        )}
      </div>
    </Card>
  );
}

function FeasibilityCard({ summary: s }: { summary: DashboardSummary }) {
  const styles = {
    empty: { ring: "stroke-muted-foreground", label: "Nothing planned", tone: "text-muted-foreground" },
    on_track: { ring: "stroke-sage", label: "On track", tone: "text-sage-strong" },
    tight: { ring: "stroke-warning", label: "Tight", tone: "text-warning-strong" },
    overloaded: { ring: "stroke-destructive", label: "Doesn't all fit", tone: "text-destructive" },
    needs_plan: { ring: "stroke-primary", label: "Needs a plan", tone: "text-primary" },
  }[s.feasibility];
  const pct = s.capacityMinutes > 0 ? Math.min(1, s.plannedTodayMinutes / s.capacityMinutes) : 0;
  const C = 2 * Math.PI * 34;
  return (
    <Card className="flex items-center gap-5 p-6">
      <svg viewBox="0 0 80 80" className="size-24 shrink-0 -rotate-90" role="img" aria-label={`${Math.round(pct * 100)}% of today's realistic capacity planned`}>
        <circle cx="40" cy="40" r="34" fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={cn(styles.ring, "transition-all duration-700")}
          strokeDasharray={`${C * pct} ${C}`}
        />
      </svg>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Am I going to finish?</p>
        <p className={cn("mt-1 text-lg font-semibold", styles.tone)}>{styles.label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{s.feasibilityText}</p>
        {s.capacityMinutes > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDuration(s.plannedTodayMinutes)} of focus planned · {formatDuration(s.capacityMinutes)} realistic today
          </p>
        )}
      </div>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Clock; label: string; value: string; hint: string }) {
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

export function Legend() {
  const entries = [
    ["bg-block-fixed border-l-2 border-blue", "Fixed"],
    ["bg-block-task border-l-2 border-primary", "Task"],
    ["bg-block-break", "Break"],
    ["bg-block-meal", "Meal"],
  ];
  return (
    <ul className="hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex" aria-label="Legend">
      {entries.map(([cls, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded", cls)} aria-hidden /> {label}
        </li>
      ))}
    </ul>
  );
}

function Welcome({ name, today, now }: { name: string; today: string; now: number }) {
  const { tz, setQuickAddOpen } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
      <div className="animate-rise">
        <p className="text-sm text-muted-foreground">{fmtDayLong(today)}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {greeting(now, tz)}, {name}
        </h1>
        <p className="mt-2 text-muted-foreground">Let&apos;s build a plan you can actually follow. Start with what&apos;s fixed, then add what you need to do.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/commitments?new=1" className="group rounded-3xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="mb-3 inline-flex size-10 items-center justify-center rounded-2xl bg-blue/20 text-blue-strong">
            <CalendarPlus className="size-5" />
          </span>
          <p className="font-semibold">1. Add your commitments</p>
          <p className="mt-1 text-sm text-muted-foreground">Lectures, shifts, gym classes — anything at a fixed time.</p>
        </Link>
        <button
          type="button"
          onClick={() => setQuickAddOpen(true)}
          className="group rounded-3xl border border-border bg-card p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="mb-3 inline-flex size-10 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <ListPlus className="size-5" />
          </span>
          <p className="font-semibold">2. Tell us what you need to do</p>
          <p className="mt-1 text-sm text-muted-foreground">Type it naturally: “essay due Thursday, about 5 hours”.</p>
        </button>
      </div>
      <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Just exploring?</p>
          <p className="text-sm text-muted-foreground">Load a sample week. It&apos;s labelled and easy to remove.</p>
        </div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await loadDemoData();
              if (!res.ok) return void toast.error(res.error);
              toast.success("Sample week loaded", { description: "Try “Plan my day” to see Daywise at work." });
              router.refresh();
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />}
          Load sample data
        </Button>
      </Card>
    </div>
  );
}
