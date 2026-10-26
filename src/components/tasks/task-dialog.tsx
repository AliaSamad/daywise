"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, PenLine, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { createTasks, updateTask } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/components/app-context";
import { parseTasks, type ParsedTask } from "@/lib/nlp/parse-tasks";
import { CATEGORY_LABEL, PRIORITY_LABEL } from "@/lib/labels";
import { formatDuration, localDateOf } from "@/lib/scheduler/time";
import { suggestEstimate } from "@/lib/reality";
import type { TaskRow } from "@/lib/data/rows";
import { emptyTaskForm, TaskForm, taskFormFrom, toTaskInput, type TaskFormValue } from "./task-form";

export function TaskDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskRow | null;
}) {
  const { tz, accuracy } = useApp();
  const router = useRouter();
  const editing = !!task;
  const [tab, setTab] = useState<"type" | "form">("type");
  const [form, setForm] = useState<TaskFormValue>(emptyTaskForm());
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<ParsedTask[] | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setForm(task ? taskFormFrom(task, tz) : emptyTaskForm());
    setTab(task ? "form" : "type");
    setText("");
    setDrafts(null);
  }, [open, task, tz]);

  const minutes = form.hours * 60 + form.minutes;
  const suggested = suggestEstimate(minutes, accuracy.find((a) => a.category === form.category));

  function saveForm() {
    if (!form.title.trim()) return toast.error("Give the task a name.");
    if (minutes < 5) return toast.error("Estimate at least 5 minutes.");
    start(async () => {
      const input = toTaskInput(form);
      const res = editing ? await updateTask(task!.id, input) : await createTasks([input]);
      if (!res.ok) return void toast.error(res.error);
      toast.success(editing ? "Task updated" : "Task added", {
        description: editing ? undefined : "Plan your day to find time for it.",
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  function parse() {
    const today = localDateOf(Date.now(), tz);
    const parsed = parseTasks(text, today);
    if (parsed.length === 0) return toast.error("I couldn't find any tasks in that. Try the form instead?");
    setDrafts(parsed);
  }

  function patchDraft(i: number, patch: Partial<ParsedTask>) {
    setDrafts((d) => d && d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  function saveDrafts() {
    if (!drafts?.length) return;
    if (drafts.some((d) => !d.title.trim())) return toast.error("Every task needs a name.");
    start(async () => {
      const res = await createTasks(
        drafts.map((d) => ({
          title: d.title,
          estimatedMinutes: d.estimatedMinutes,
          deadlineDate: d.deadlineDate ?? "",
          deadlineTime: d.deadlineTime ?? "",
          priority: d.priority,
          category: d.category,
          customCategory: null,
          splittable: d.estimatedMinutes > 60,
          minSessionMinutes: Math.min(25, d.estimatedMinutes),
          earliestStart: "",
          preferredTime: "",
        })),
      );
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${drafts.length} task${drafts.length === 1 ? "" : "s"} added`, { description: "Plan your day to fit them in." });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit task" : "Add tasks"}</DialogTitle>
          <DialogDescription>
            {editing ? "Changes apply the next time you plan." : "Type naturally, or fill in the details yourself."}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <TaskForm value={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} suggestion={<Suggestion suggested={suggested} onUse={(m) => setForm((f) => ({ ...f, hours: Math.floor(m / 60), minutes: m % 60 - ((m % 60) % 5) }))} />} />
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "type" | "form")}>
            <TabsList className="w-full">
              <TabsTrigger value="type" className="flex-1">
                <Sparkles /> Type it
              </TabsTrigger>
              <TabsTrigger value="form" className="flex-1">
                <PenLine /> Form
              </TabsTrigger>
            </TabsList>
            <TabsContent value="type">
              {!drafts ? (
                <div className="flex flex-col gap-3">
                  <label htmlFor="nl-input" className="sr-only">
                    Describe your tasks
                  </label>
                  <Textarea
                    id="nl-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={5}
                    autoFocus
                    placeholder="I have an essay due Thursday that will take about 5 hours, a coding assignment due tomorrow that takes 2 hours, and I need to buy groceries."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) parse();
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Mention durations (“2 hours”), deadlines (“due Friday 5pm”) and priority (“urgent”). You&apos;ll review everything before it&apos;s saved.
                  </p>
                  <DialogFooter className="mt-2">
                    <Button onClick={parse} disabled={!text.trim()}>
                      <Wand2 /> Turn into tasks
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">Here&apos;s what I understood. Edit anything before saving.</p>
                  <ul className="flex flex-col gap-2">
                    {drafts.map((d, i) => (
                      <li key={i} className="animate-rise rounded-2xl border border-border bg-background/60 p-3" style={{ animationDelay: `${i * 50}ms` }}>
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`Task ${i + 1} name`}
                            value={d.title}
                            onChange={(e) => patchDraft(i, { title: e.target.value })}
                            className="font-medium"
                          />
                          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${d.title}`} onClick={() => setDrafts((x) => x && x.filter((_, j) => j !== i))}>
                            <Trash2 />
                          </Button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <NativeSelect
                            aria-label="Duration"
                            value={d.estimatedMinutes}
                            onChange={(e) => patchDraft(i, { estimatedMinutes: Number(e.target.value), durationGuessed: false })}
                          >
                            {durationOptions(d.estimatedMinutes).map((m) => (
                              <option key={m} value={m}>
                                {formatDuration(m)}
                              </option>
                            ))}
                          </NativeSelect>
                          <Input
                            aria-label="Deadline"
                            type="date"
                            value={d.deadlineDate ?? ""}
                            onChange={(e) => patchDraft(i, { deadlineDate: e.target.value || null, deadlineTime: e.target.value ? d.deadlineTime ?? "23:59" : null })}
                          />
                          <NativeSelect aria-label="Priority" value={d.priority} onChange={(e) => patchDraft(i, { priority: e.target.value as ParsedTask["priority"] })}>
                            {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </NativeSelect>
                          <NativeSelect aria-label="Category" value={d.category} onChange={(e) => patchDraft(i, { category: e.target.value as ParsedTask["category"] })}>
                            {Object.entries(CATEGORY_LABEL)
                              .filter(([k]) => k !== "custom")
                              .map(([k, l]) => (
                                <option key={k} value={k}>
                                  {l}
                                </option>
                              ))}
                          </NativeSelect>
                        </div>
                        {d.durationGuessed && (
                          <p className="mt-2 flex items-center gap-1 text-xs text-warning-strong">
                            <AlertCircle className="size-3" /> No duration mentioned — {formatDuration(d.estimatedMinutes)} is a guess.
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setDrafts(null)} disabled={pending}>
                      Back to text
                    </Button>
                    <Button onClick={saveDrafts} disabled={pending || drafts.length === 0}>
                      {pending && <Loader2 className="animate-spin" />}
                      Save {drafts.length} task{drafts.length === 1 ? "" : "s"}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </TabsContent>
            <TabsContent value="form">
              <TaskForm value={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} suggestion={<Suggestion suggested={suggested} onUse={(m) => setForm((f) => ({ ...f, hours: Math.floor(m / 60), minutes: m % 60 - ((m % 60) % 5) }))} />} />
            </TabsContent>
          </Tabs>
        )}

        {(editing || tab === "form") && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={saveForm} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Add task"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Suggestion({ suggested, onUse }: { suggested: number | null; onUse: (m: number) => void }) {
  if (!suggested) return null;
  return (
    <button
      type="button"
      onClick={() => onUse(suggested)}
      className="mt-1 self-start rounded-lg text-left text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Badge className="mr-1">Reality Mode</Badge>
      Similar tasks usually take you {formatDuration(suggested)}. Use that?
    </button>
  );
}

function durationOptions(current: number): number[] {
  const base = [10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480, 600];
  return Array.from(new Set([...base, current])).sort((a, b) => a - b);
}
