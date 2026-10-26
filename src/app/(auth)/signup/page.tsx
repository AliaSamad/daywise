"use client";

import Link from "next/link";
import { signUp } from "@/app/actions/auth";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthForm } from "../auth-form";

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <h1 className="font-display text-2xl font-semibold">Plan for real life</h1>
        <CardDescription>Create your account — it takes a minute.</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm
          action={signUp}
          submitLabel="Create account"
          success={() => (
            <>
              <p className="font-medium">Check your inbox</p>
              <p className="mt-1">We&apos;ve sent you a link to confirm your email. Open it on this device to continue.</p>
            </>
          )}
        >
          <Field id="name" label="Your name">
            <Input id="name" name="name" autoComplete="given-name" required />
          </Field>
          <Field id="email" label="Email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field id="password" label="Password" hint="At least 8 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
        </AuthForm>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
