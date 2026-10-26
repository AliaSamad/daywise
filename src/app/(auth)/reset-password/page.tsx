"use client";

import Link from "next/link";
import { updatePassword } from "@/app/actions/auth";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthForm } from "../auth-form";

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <h1 className="font-display text-2xl font-semibold">Choose a new password</h1>
        <CardDescription>You&apos;re signed in from the reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm
          action={updatePassword}
          submitLabel="Save password"
          success={() => (
            <p>
              Password updated.{" "}
              <Link href="/today" className="font-medium underline">
                Go to today
              </Link>
            </p>
          )}
        >
          <Field id="password" label="New password" hint="At least 8 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </Field>
          <Field id="confirm" label="Confirm password">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
        </AuthForm>
      </CardContent>
    </Card>
  );
}
