"use client";

import { useState, useTransition } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { previewPlan } from "@/app/actions/planner";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { PlanPreview } from "@/lib/planner/preview";
import { PlanPreviewDialog } from "./plan-preview-dialog";

export function PlanButton({
  scope,
  weekStart,
  children,
  ...props
}: { scope: "day" | "week"; weekStart?: string } & ButtonProps) {
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const res = await previewPlan({ scope, weekStart });
      if (!res.ok) return void toast.error(res.error);
      setPreview(res.data);
    });
  }

  return (
    <>
      <Button onClick={run} disabled={pending} {...props}>
        {pending ? <Loader2 className="animate-spin" /> : <Wand2 />}
        {children ?? (scope === "day" ? "Plan my day" : "Plan my week")}
      </Button>
      <PlanPreviewDialog preview={preview} onOpenChange={(o) => !o && setPreview(null)} />
    </>
  );
}
