"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlanButton } from "@/components/planner/plan-button";
import { Legend } from "@/components/dashboard/dashboard";
import type { CalendarItem } from "@/lib/calendar/items";
import type { DayLoad } from "@/lib/scheduler/types";
import { addDaysLocal, formatDuration } from "@/lib/scheduler/time";
import { fmtDayShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TimeGrid } from "./time-grid";

export function WeekView({
  weekStart,
  days,
  items,
  now: serverNow,
  loads,
  conflicts,
  canPlan,
  isCurrentWeek,
  tasks,
}: {
  weekStart: string;
  days: string[];
  items: CalendarItem[];
  now: number;
  loads: DayLoad[];
  conflicts: number;
  canPlan: boolean;
  isCurrentWeek: boolean;
  tasks: { id: string; title: string; estimatedMinutes: number }[];
}) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const end = addDaysLocal(weekStart, 6);
  const overloaded = loads.filter((l) => l.status === "overloaded").length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Week view</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {fmtDayShort(weekStart)} – {fmtDayShort(end)}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-border bg-card">
            <Button asChild variant="ghost" size="icon" aria-label="Previous week">
              <Link href={`/week?week=${addDaysLocal(weekStart, -7)}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" disabled={isCurrentWeek}>
              <Link href="/week">This week</Link>
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Next week">
              <Link href={`/week?week=${addDaysLocal(weekStart, 7)}`}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
          {canPlan && <PlanButton scope="week" weekStart={weekStart} size="lg" />}
        </div>
      </header>

      {(conflicts > 0 || overloaded > 0) && (
        <div role="status" className="flex flex-col gap-1 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          {conflicts > 0 && (
            <p className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning-strong" />
              {conflicts} commitment clash{conflicts === 1 ? "" : "es"} this week — outlined in red. Tap one to edit or cancel it.
            </p>
          )}
          {overloaded > 0 && (
            <p className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning-strong" />
              {overloaded} day{overloaded === 1 ? " has" : "s have"} more planned than you can realistically do.
            </p>
          )}
        </div>
      )}

      <Card className="overflow-hidden p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">Drag task blocks between days and times. Alt + arrow keys work too.</p>
          <Legend />
        </div>
        <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <div className="min-w-[44rem]">
            <div className="mb-1 flex pl-12" aria-label="Daily workload">
              {loads.map((l) => {
                const pct = l.capacityMinutes ? Math.min(100, (l.plannedMinutes / l.capacityMinutes) * 100) : l.plannedMinutes ? 100 : 0;
                return (
                  <div key={l.date} className="flex-1 px-1" title={`${formatDuration(l.plannedMinutes)} planned of ${formatDuration(l.capacityMinutes)} realistic`}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          l.status === "overloaded" ? "bg-destructive" : l.status === "full" ? "bg-warning" : "bg-sage",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-center text-[10px] text-muted-foreground">
                      {l.isRestDay && l.plannedMinutes === 0 ? "Rest" : formatDuration(l.plannedMinutes)}
                    </p>
                  </div>
                );
              })}
            </div>
            <TimeGrid days={days} items={items} now={now} tasks={tasks} hourHeight={52} className="h-[min(72dvh,760px)]" />
          </div>
        </div>
      </Card>
    </div>
  );
}
