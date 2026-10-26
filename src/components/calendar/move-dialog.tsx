"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useApp } from "@/components/app-context";
import { localDateOf, MINUTE, zonedInstant } from "@/lib/scheduler/time";
import { fmtTime } from "@/lib/format";
import type { MoveRequest } from "./use-session-mover";

/** Keyboard- and touch-friendly alternative to dragging: pick a new date and time. */
export function MoveDialog({
  target,
  onClose,
  onMove,
}: {
  target: MoveRequest | null;
  onClose: () => void;
  onMove: (req: MoveRequest) => void;
}) {
  const { tz } = useApp();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  useEffect(() => {
    if (!target) return;
    setDate(localDateOf(target.start, tz));
    setTime(fmtTime(target.start, tz));
  }, [target, tz]);
  const duration = target ? target.end - target.start : 0;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move “{target?.title}”</DialogTitle>
          <DialogDescription>Keeps the same length ({Math.round(duration / MINUTE)} min). We&apos;ll check for clashes.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field id="move-date" label="Date">
            <Input id="move-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id="move-time" label="Start time">
            <Input id="move-time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!date || !time}
            onClick={() => {
              if (!target) return;
              const start = zonedInstant(date, time, tz);
              onMove({ ...target, start, end: start + duration });
              onClose();
            }}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
