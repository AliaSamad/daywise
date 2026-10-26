"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { setTaskStatus } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/scheduler/time";

export interface CompleteTarget {
  id: string;
  title: string;
  estimatedMinutes: number;
}

/** Mark a task complete and (optionally) record how long it really took, for Reality Mode. */
export function CompleteTaskDialog({ target, onClose }: { target: CompleteTarget | null; onClose: () => void }) {
  const router = useRouter();
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!target) return;
    setHours("");
    setMinutes("");
  }, [target]);

  function finish(withTime: boolean) {
    if (!target) return;
    const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
    if (withTime && (total < 1 || total > 1440)) return toast.error("Enter between 1 minute and 24 hours, or skip.");
    start(async () => {
      const res = await setTaskStatus(target.id, "completed", withTime ? total : null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`“${target.title}” done`, { description: "Nice work. Its remaining blocks have been cleared." });
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="size-5 text-primary" /> Finished “{target?.title}”?
          </DialogTitle>
          <DialogDescription>
            You estimated {target ? formatDuration(target.estimatedMinutes) : ""}. How long did it actually take? This helps Daywise
            plan more realistically — skip it if you&apos;re not sure.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field id="actual-h" label="Hours">
            <Input id="actual-h" type="number" inputMode="numeric" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
          <Field id="actual-m" label="Minutes">
            <Input id="actual-m" type="number" inputMode="numeric" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => finish(false)} disabled={pending}>
            Skip and complete
          </Button>
          <Button onClick={() => finish(true)} disabled={pending || (!hours && !minutes)}>
            {pending && <Loader2 className="animate-spin" />}
            Save and complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
