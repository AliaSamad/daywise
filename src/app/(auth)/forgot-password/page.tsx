"use client";

import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthForm } from "../auth-form";

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <h1 className="font-display text-2xl font-semibold">Reset your password</h1>
        <CardDescription>We&apos;ll email you a link to choose a new one.</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm
          action={requestPasswordReset}
          submitLabel="Send reset link"
          success={() => <p>If there&apos;s an account for that email, a reset link is on its way.</p>}
        >
          <Field id="email" label="Email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
        </AuthForm>
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Back to log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
