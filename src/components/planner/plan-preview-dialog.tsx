"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, Lightbulb, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { applyPlan } from "@/app/actions/planner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp } from "@/components/app-context";
import type { PlanPreview } from "@/lib/planner/preview";
import { durationMin, formatDuration, localDateOf } from "@/lib/scheduler/time";
import { fmtDayShort, fmtDeadline, fmtRange, fmtWeekday } from "@/lib/format";
import { PRIORITY_BADGE, PRIORITY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function PlanPreviewDialog({
  preview,
  onOpenChange,
}: {
  preview: PlanPreview | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { tz } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  const p = preview;

  function apply() {
    if (!p) return;
    start(async () => {
      const res = await applyPlan({
        rangeStart: p.rangeStart,
        rangeEnd: p.rangeEnd,
        sessions: p.sessions.map(({ taskId, kind, start, end }) => ({ taskId, kind, start, end })),
        extraTime: p.extraTime,
        summary: {
          scope: p.scope,
          feasible: p.feasible,
          headline: p.headline,
          unscheduled: p.unscheduled.filter((u) => u.reason !== "outside_horizon").length,
          atRisk: p.atRisk.length,
        },
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Plan saved", { description: "Drag blocks to adjust — Daywise will check for clashes." });
      onOpenChange(false);
      router.refresh();
    });
  }

  const byDay = new Map<string, PlanPreview["sessions"]>();
  for (const s of p?.sessions ?? []) {
    const d = localDateOf(s.start, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const blocking = p?.unscheduled.filter((u) => u.reason !== "outside_horizon") ?? [];
  const later = p?.unscheduled.filter((u) => u.reason === "outside_horizon") ?? [];
  const taskMinutes = (p?.sessions ?? []).filter((s) => s.kind === "task").reduce((a, s) => a + durationMin(s), 0);
  const changed = (p?.changes ?? []).filter((c) => c.beforeMinutes !== c.afterMinutes || c.beforeFirstDay !== c.afterFirstDay);
  const nothingToDo = p && p.sessions.length === 0 && p.removedCount === 0;

  const tone = !p ? "ok" : blocking.length ? "bad" : p.atRisk.length ? "warn" : "ok";

  return (
    <Dialog open={!!p} onOpenChange={onOpenChange}>
      <DialogContent wide>
        {p && (
          <>
            <DialogHeader>
              <DialogTitle>{p.title}</DialogTitle>
              <DialogDescription>Nothing changes until you approve it.</DialogDescription>
            </DialogHeader>

            <div
              className={cn(
                "flex items-start gap-3 rounded-2xl p-4",
                tone === "ok" && "bg-sage/15 text-sage-strong",
                tone === "warn" && "bg-warning/15 text-warning-strong",
                tone === "bad" && "bg-destructive/10 text-destructive",
              )}
              role="status"
            >
              {tone === "ok" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0" />}
              <div>
                <p className="font-medium">{p.headline}</p>
                <p className="mt-0.5 text-sm opacity-90">
                  {taskMinutes > 0 ? `${formatDuration(taskMinutes)} of focused work planned` : "No new work blocks"}
                  {p.removedCount > 0 && ` · replaces ${p.removedCount} earlier block${p.removedCount === 1 ? "" : "s"}`}
                  {p.missedCount > 0 && ` · ${p.missedCount} missed block${p.missedCount === 1 ? "" : "s"} rescheduled`}
                </p>
              </div>
            </div>

            {p.days.length > 1 && (
              <section className="mt-5" aria-label="Daily workload">
                <div className="grid grid-cols-7 gap-1.5">
                  {p.days.map((d) => {
                    const pct = d.capacityMinutes > 0 ? Math.min(100, (d.plannedMinutes / d.capacityMinutes) * 100) : 0;
                    return (
                      <div key={d.date} className="flex flex-col items-center gap-1" title={`${formatDuration(d.plannedMinutes)} of ${formatDuration(d.capacityMinutes)}`}>
                        <div className="relative h-16 w-full overflow-hidden rounded-xl bg-muted">
                          <div
                            className={cn(
                              "absolute inset-x-0 bottom-0 rounded-xl transition-all",
                              d.status === "overloaded" ? "bg-destructive/60" : d.status === "full" ? "bg-warning/70" : "bg-primary/60",
                            )}
                            style={{ height: `${d.isRestDay && d.plannedMinutes === 0 ? 0 : Math.max(pct, d.plannedMinutes ? 8 : 0)}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground">{fmtWeekday(d.date)}</span>
                        <span className="sr-only">
                          {fmtDayShort(d.date)}: {formatDuration(d.plannedMinutes)} planned of {formatDuration(d.capacityMinutes)} realistic capacity
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {blocking.length > 0 && (
              <section className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">What doesn&apos;t fit</h3>
                <ul className="flex flex-col gap-2">
                  {blocking.map((u) => (
                    <li key={u.taskId} className="rounded-2xl border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{u.title}</span>
                        <Badge variant={PRIORITY_BADGE[u.priority]}>{PRIORITY_LABEL[u.priority]}</Badge>
                        {u.deadline && <span className="text-xs text-muted-foreground">Due {fmtDeadline(u.deadline, tz)}</span>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{u.explanation}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {p.suggestions.length > 0 && (
              <section className="mt-5">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Lightbulb className="size-4 text-warning-strong" /> Some options
                </h3>
                <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  {p.suggestions.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0" /> {s.text}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Daywise never cancels commitments or deletes tasks for you — edit them yourself if you choose to.
                </p>
              </section>
            )}

            {p.atRisk.length > 0 && (
              <section className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">Tight deadlines</h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {p.atRisk.map((a) => (
                    <li key={a.taskId} className="flex items-center gap-2">
                      <Clock className="size-4 text-warning-strong" />
                      <span className="font-medium">{a.title}</span>
                      <span className="text-muted-foreground">
                        {a.slackMinutes < 0
                          ? "deadline has passed — scheduled as soon as possible"
                          : `finishes ${formatDuration(a.slackMinutes)} before the deadline`}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {changed.length > 0 && p.removedCount > 0 && (
              <section className="mt-5">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Undo2 className="size-4" /> What changed
                </h3>
                <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  {changed.map((c) => (
                    <li key={c.taskId}>
                      <span className="font-medium text-foreground">{c.title}</span>:{" "}
                      {c.beforeFirstDay > c.afterFirstDay && p.scope !== "week"
                        ? `${formatDuration(c.beforeFirstDay)} today → ${formatDuration(c.afterFirstDay)}; the rest moves to later days`
                        : `${formatDuration(c.beforeMinutes)} → ${formatDuration(c.afterMinutes)} planned`}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {p.deferred.length > 0 && p.scope === "day" && (
              <section className="mt-5 rounded-2xl bg-muted/60 p-3.5 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <CalendarClock className="size-4" /> Also needs time later this week
                </p>
                <p className="mt-1 text-muted-foreground">
                  {p.deferred.map((d) => `${d.title} (${formatDuration(d.minutes)})`).join(", ")}. Use “Plan my week” to place these.
                </p>
              </section>
            )}

            {later.length > 0 && p.scope !== "day" && (
              <p className="mt-4 text-xs text-muted-foreground">
                Due after this window, so left for later: {later.map((u) => u.title).join(", ")}.
              </p>
            )}

            <section className="mt-5">
              <h3 className="mb-2 text-sm font-semibold">The plan</h3>
              {byDay.size === 0 ? (
                <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
                  {nothingToDo ? "There's nothing new to schedule here." : "No new blocks — earlier blocks will be cleared."}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {Array.from(byDay.entries()).map(([day, list]) => (
                    <div key={day}>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{fmtDayShort(day)}</p>
                      <ul className="flex flex-col gap-1">
                        {list.map((s, i) => (
                          <li
                            key={i}
                            className={cn(
                              "flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm",
                              s.kind === "task" ? "bg-block-task text-block-task-fg" : "bg-block-break/70 text-block-break-fg",
                            )}
                          >
                            <span className="w-28 shrink-0 tabular-nums opacity-80">{fmtRange(s.start, s.end, tz)}</span>
                            <span className="truncate font-medium">{s.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                Not now
              </Button>
              <Button onClick={apply} disabled={pending || !!nothingToDo}>
                {pending && <Loader2 className="animate-spin" />}
                Apply plan
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
