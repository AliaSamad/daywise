"use client";

import { useEffect } from "react";
import { CloudOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
        <CloudOff className="size-6 text-muted-foreground" />
      </span>
      <h1 className="font-display text-2xl font-semibold">We couldn&apos;t load this</h1>
      <p className="text-sm text-muted-foreground">
        Your data is safe. This is usually a connection hiccup — try again in a moment.
      </p>
      <Button onClick={reset}>
        <RotateCcw /> Try again
      </Button>
    </div>
  );
}
