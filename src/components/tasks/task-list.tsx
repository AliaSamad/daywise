"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, CircleDashed, ListTodo, MoreHorizontal, Pencil, PlayCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTask, setTaskStatus } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApp } from "@/components/app-context";
import { TaskDialog } from "./task-dialog";
import { CompleteTaskDialog, type CompleteTarget } from "./complete-task-dialog";
import { PlanButton } from "@/components/planner/plan-button";
import type { TaskRow } from "@/lib/data/rows";
import { addDaysLocal, formatDuration, localDateOf } from "@/lib/scheduler/time";
import { fmtDeadline } from "@/lib/format";
import { CATEGORY_DOT, CATEGORY_LABEL, PRIORITY_BADGE, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

type Group = "Overdue" | "Today" | "Tomorrow" | "This week" | "Later" | "No deadline" | "Completed";

export function TaskList({
  tasks,
  done,
  upcoming,
  missed,
  editId,
  now,
}: {
  tasks: TaskRow[];
  done: Record<string, number>;
  upcoming: Record<string, number>;
  missed: Record<string, number>;
  editId: string | null;
  now: number;
}) {
  const { tz, setQuickAddOpen } = useApp();
  const router = useRouter();
  const [status, setStatus] = useState<"open" | "completed" | "all">("open");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"deadline" | "priority">("deadline");
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [completing, setCompleting] = useState<CompleteTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    if (!editId) return;
    const t = tasks.find((x) => x.id === editId);
    if (t) setEditing(t);
  }, [editId, tasks]);

  const today = localDateOf(now, tz);

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => (status === "all" ? true : status === "open" ? t.status !== "completed" : t.status === "completed"))
      .filter((t) => priority === "all" || t.priority === priority)
      .filter((t) => category === "all" || t.category === category)
      .sort((a, b) => {
        if (sort === "priority") {
          const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
          if (p) return p;
        }
        const da = a.deadline ? Date.parse(a.deadline) : Infinity;
        const db = b.deadline ? Date.parse(b.deadline) : Infinity;
        return da - db || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      });
  }, [tasks, status, priority, category, sort]);

  function groupOf(t: TaskRow): Group {
    if (t.status === "completed") return "Completed";
    if (!t.deadline) return "No deadline";
    const d = Date.parse(t.deadline);
    if (d < now) return "Overdue";
    const date = localDateOf(d, tz);
    if (date === today) return "Today";
    if (date === addDaysLocal(today, 1)) return "Tomorrow";
    if (date <= addDaysLocal(today, 7)) return "This week";
    return "Later";
  }

  const groups = useMemo(() => {
    const order: Group[] = ["Overdue", "Today", "Tomorrow", "This week", "Later", "No deadline", "Completed"];
    const map = new Map<Group, TaskRow[]>();
    for (const t of filtered) {
      const g = groupOf(t);
      map.set(g, [...(map.get(g) ?? []), t]);
    }
    return sort === "deadline" ? order.filter((g) => map.has(g)).map((g) => [g, map.get(g)!] as const) : ([["All", filtered]] as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, now, tz]);

  const openCount = tasks.filter((t) => t.status !== "completed").length;
  const unscheduled = tasks.filter((t) => {
    if (t.status === "completed") return false;
    const remaining = t.estimated_minutes - (done[t.id] ?? 0);
    return remaining > 0 && (upcoming[t.id] ?? 0) < remaining;
  }).length;

  function setStatusFor(t: TaskRow, s: "not_started" | "in_progress") {
    start(async () => {
      const res = await setTaskStatus(t.id, s);
      if (!res.ok) return void toast.error(res.error);
      toast.success(s === "in_progress" ? "Marked in progress" : "Task reopened");
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteTask(id);
      if (!res.ok) return void toast.error(res.error);
      setConfirmDelete(null);
      toast.success("Task deleted");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {openCount} open{unscheduled > 0 ? ` · ${unscheduled} not fully scheduled` : ""}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Tasks</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {unscheduled > 0 && <PlanButton scope="week" variant="secondary" size="lg" />}
          <Button size="lg" onClick={() => setQuickAddOpen(true)}>
            <Plus /> Add tasks
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filter tasks">
        <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">Open</option>
          <option value="completed">Completed</option>
          <option value="all">All</option>
        </NativeSelect>
        <NativeSelect aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="all">Any priority</option>
          {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Any category</option>
          {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="deadline">By deadline</option>
          <option value="priority">By priority</option>
        </NativeSelect>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary">
            <ListTodo className="size-5 text-secondary-foreground" />
          </span>
          <p className="font-medium">{tasks.length === 0 ? "No tasks yet" : "Nothing matches these filters"}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {tasks.length === 0
              ? "Add what's on your plate — Daywise will work out when you can realistically do it."
              : "Try a different filter."}
          </p>
          {tasks.length === 0 && (
            <Button onClick={() => setQuickAddOpen(true)}>
              <Plus /> Add your first task
            </Button>
          )}
        </Card>
      ) : (
        groups.map(([group, list]) => (
          <section key={group} aria-labelledby={`g-${group}`}>
            <h2 id={`g-${group}`} className={cn("mb-2 px-1 text-xs font-semibold uppercase tracking-wider", group === "Overdue" ? "text-destructive" : "text-muted-foreground")}>
              {group} <span className="font-normal">· {list.length}</span>
            </h2>
            <ul className="flex flex-col gap-2">
              {list.map((t) => {
                const completed = t.status === "completed";
                const doneMin = done[t.id] ?? 0;
                const remaining = Math.max(0, t.estimated_minutes - doneMin);
                const sched = upcoming[t.id] ?? 0;
                const pct = t.estimated_minutes ? ((doneMin + Math.min(sched, remaining)) / t.estimated_minutes) * 100 : 0;
                const notScheduled = !completed && remaining > 0 && sched < remaining;
                return (
                  <li key={t.id}>
                    <Card className={cn("flex items-start gap-3 p-4 transition-shadow hover:shadow-lg", completed && "opacity-70")}>
                      <button
                        type="button"
                        aria-label={completed ? `Reopen ${t.title}` : `Complete ${t.title}`}
                        onClick={() => (completed ? setStatusFor(t, "not_started") : setCompleting({ id: t.id, title: t.title, estimatedMinutes: t.estimated_minutes }))}
                        className={cn(
                          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          completed ? "border-sage bg-sage text-sage-foreground" : "border-border hover:border-sage",
                        )}
                      >
                        {completed && <Check className="size-3.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" onClick={() => setEditing(t)} className={cn("text-left font-medium hover:underline", completed && "line-through")}>
                            {t.title}
                          </button>
                          {t.is_demo && <Badge variant="warning">Sample</Badge>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                          <Badge variant={PRIORITY_BADGE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                          <span className="flex items-center gap-1.5">
                            <span className={cn("size-2 rounded-full", CATEGORY_DOT[t.category])} aria-hidden />
                            {t.category === "custom" ? t.custom_category : CATEGORY_LABEL[t.category]}
                          </span>
                          {t.deadline && (
                            <span className={cn("flex items-center gap-1", !completed && Date.parse(t.deadline) < now && "text-destructive")}>
                              <CalendarClock className="size-3" aria-hidden /> {!completed && Date.parse(t.deadline) < now ? "Overdue · " : ""}{fmtDeadline(Date.parse(t.deadline), tz)}
                            </span>
                          )}
                          <span>{formatDuration(t.estimated_minutes)}</span>
                          {!completed && t.status === "in_progress" && <span className="text-primary">{STATUS_LABEL.in_progress}</span>}
                          {!completed && (missed[t.id] ?? 0) > 0 && <span className="text-destructive">{missed[t.id]} missed block{missed[t.id] === 1 ? "" : "s"}</span>}
                        </div>
                        {!completed && (
                          <div className="mt-2.5 flex items-center gap-3">
                            <Progress value={pct} label={`${t.title}: done and scheduled`} className="h-1.5 max-w-48" />
                            <span className={cn("text-[11px]", notScheduled ? "text-warning-strong" : "text-muted-foreground")}>
                              {notScheduled ? (
                                <span className="inline-flex items-center gap-1">
                                  <CircleDashed className="size-3" /> {formatDuration(remaining - sched)} not scheduled yet
                                </span>
                              ) : (
                                `${formatDuration(doneMin)} done · ${formatDuration(sched)} scheduled`
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.title}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(t)}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          {t.status === "not_started" && (
                            <DropdownMenuItem onSelect={() => setStatusFor(t, "in_progress")}>
                              <PlayCircle /> Mark in progress
                            </DropdownMenuItem>
                          )}
                          {completed ? (
                            <DropdownMenuItem onSelect={() => setStatusFor(t, "not_started")}>
                              <RotateCcw /> Reopen
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => setCompleting({ id: t.id, title: t.title, estimatedMinutes: t.estimated_minutes })}>
                              <Check /> Complete…
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => setConfirmDelete(t.id)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Card>
                    {confirmDelete === t.id && (
                      <div role="alertdialog" aria-label="Confirm delete" className="mx-2 -mt-1 flex animate-rise items-center justify-between gap-2 rounded-b-2xl bg-destructive/10 px-4 py-2 text-sm">
                        <span>Delete “{t.title}” and its scheduled blocks?</span>
                        <span className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                            Keep
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => remove(t.id)}>
                            Delete
                          </Button>
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <TaskDialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            if (editId) router.replace("/tasks");
          }
        }}
        task={editing}
      />
      <CompleteTaskDialog target={completing} onClose={() => setCompleting(null)} />
    </div>
  );
}
