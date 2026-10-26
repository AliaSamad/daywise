"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { moveSession } from "@/app/actions/sessions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface MoveRequest {
  sessionId: string;
  title: string;
  start: number;
  end: number;
}

/**
 * Moves a task block via the server, which validates it against the real calendar.
 * Hard conflicts are rejected with an explanation; soft ones ask for confirmation.
 */
export function useSessionMover() {
  const router = useRouter();
  const [confirm, setConfirm] = useState<{ req: MoveRequest; warnings: string[] } | null>(null);
  const [optimistic, setOptimistic] = useState<MoveRequest | null>(null);
  const [pending, start] = useTransition();

  function send(req: MoveRequest, confirmed: boolean) {
    setOptimistic(req);
    start(async () => {
      const res = await moveSession({ id: req.sessionId, start: req.start, end: req.end, confirmed });
      if (!res.ok) {
        setOptimistic(null);
        toast.error("Can't move it there", { description: res.error });
        return;
      }
      if (res.data.needsConfirmation) {
        setOptimistic(null);
        setConfirm({ req, warnings: res.data.warnings });
        return;
      }
      setConfirm(null);
      toast.success(`Moved “${req.title}”`, { description: "It's pinned there — planning won't move it." });
      router.refresh();
      // Keep the optimistic position until fresh data arrives.
      setTimeout(() => setOptimistic(null), 800);
    });
  }

  const dialog = (
    <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move it anyway?</DialogTitle>
          <DialogDescription>That time works, but a couple of things are worth knowing:</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {confirm?.warnings.map((w) => (
            <li key={w} className="flex items-start gap-2 rounded-xl bg-warning/10 p-2.5 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-strong" /> {w}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Keep it where it was
          </Button>
          <Button onClick={() => confirm && send(confirm.req, true)} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Move anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestMove: (req: MoveRequest) => send(req, false), dialog, optimistic, pending };
}
