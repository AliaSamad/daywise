"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/app/actions/result";

/** Shared shell for the auth forms: pending state, error and success messages. */
export function AuthForm<T>({
  action,
  submitLabel,
  children,
  success,
}: {
  action: (prev: unknown, form: FormData) => Promise<ActionResult<T>>;
  submitLabel: string;
  children: React.ReactNode;
  success?: (data: T) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  if (state?.ok && success) {
    return (
      <div role="status" className="rounded-2xl bg-sage/15 p-4 text-sm text-sage-strong">
        {success(state.data)}
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {children}
      {state && !state.ok && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
