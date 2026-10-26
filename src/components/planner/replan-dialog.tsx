"use client";

import { useState, useTransition } from "react";
import { Battery, Clock, Coffee, Hourglass, Loader2, RefreshCw, TriangleAlert, Undo } from "lucide-react";
import { toast } from "sonner";
import { previewPlan } from "@/app/actions/planner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/ui/field";
import type { PlanPreview } from "@/lib/planner/preview";
import { formatDuration } from "@/lib/scheduler/time";
import { cn } from "@/lib/utils";
import { PlanPreviewDialog } from "./plan-preview-dialog";

type Reason = "late" | "longer" | "tired" | "unexpected" | "missed" | "break";

const REASONS: { id: Reason; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "late", label: "I'm running late", icon: Clock },
  { id: "longer", label: "A task took longer than expected", icon: Hourglass },
  { id: "tired", label: "I'm too tired right now", icon: Battery },
  { id: "unexpected", label: "Something unexpected came up", icon: TriangleAlert },
  { id: "missed", label: "I missed something", icon: Undo },
  { id: "break", label: "I want to take a break", icon: Coffee },
];

const DELAYS: Record<Reason, number[]> = {
  late: [15, 30, 45, 60, 90],
  tired: [30, 45, 60, 90],
  unexpected: [30, 60, 90, 120, 180, 240],
  break: [10, 15, 20, 30, 45, 60],
  longer: [],
  missed: [],
};

export function ReplanButton({
  openTasks,
  ...props
}: { openTasks: { id: string; title: string }[] } & ButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("late");
  const [delay, setDelay] = useState(30);
  const [taskId, setTaskId] = useState("");
  const [extra, setExtra] = useState(30);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [pending, start] = useTransition();

  function pick(r: Reason) {
    setReason(r);
    if (DELAYS[r].length) setDelay(r === "break" ? 15 : DELAYS[r][1] ?? DELAYS[r][0]);
  }

  function go() {
    if (reason === "longer" && !taskId) return toast.error("Which task took longer?");
    start(async () => {
      const res = await previewPlan({
        scope: "replan",
        delayMinutes: DELAYS[reason].length ? delay : 0,
        extraTime: reason === "longer" ? { taskId, minutes: extra } : undefined,
      });
      if (!res.ok) return void toast.error(res.error);
      setOpen(false);
      setPreview(res.data);
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} {...props}>
        <RefreshCw /> Replan my day
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plans changed? That&apos;s normal.</DialogTitle>
            <DialogDescription>Tell me what happened and I&apos;ll rework the rest of your day. You&apos;ll see the changes first.</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="What happened?" className="grid gap-2">
            {REASONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={reason === id}
                onClick={() => pick(id)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-3 text-left text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  reason === id ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                )}
              >
                <Icon className={cn("size-4", reason === id ? "text-primary" : "text-muted-foreground")} />
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {DELAYS[reason].length > 0 && (
              <Field
                id="replan-delay"
                label={reason === "break" ? "Break for" : reason === "tired" ? "Rest for" : "Don't schedule anything for the next"}
              >
                <NativeSelect id="replan-delay" value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
                  {DELAYS[reason].map((m) => (
                    <option key={m} value={m}>
                      {formatDuration(m)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {reason === "tired" && (
              <p className="mt-2 text-xs text-muted-foreground">Rest is productive too. Anything that no longer fits moves to later days.</p>
            )}
            {reason === "longer" && (
              <div className="grid grid-cols-[1fr_8rem] gap-3">
                <Field id="replan-task" label="Which task?">
                  <NativeSelect id="replan-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                    <option value="">Choose…</option>
                    {openTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="replan-extra" label="Needs about">
                  <NativeSelect id="replan-extra" value={extra} onChange={(e) => setExtra(Number(e.target.value))}>
                    {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                      <option key={m} value={m}>
                        +{formatDuration(m)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            )}
            {reason === "missed" && (
              <p className="rounded-2xl bg-muted/60 p-3 text-sm text-muted-foreground">
                Missed blocks stay visible on your calendar, and their tasks are rescheduled into the time you have left.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={go} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Show me the new plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PlanPreviewDialog preview={preview} onOpenChange={(o) => !o && setPreview(null)} />
    </>
  );
}
