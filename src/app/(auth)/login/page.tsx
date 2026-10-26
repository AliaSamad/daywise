import Link from "next/link";
import { signIn } from "@/app/actions/auth";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <h1 className="font-display text-2xl font-semibold">Welcome back</h1>
        <CardDescription>Log in to see today&apos;s plan.</CardDescription>
      </CardHeader>
      <CardContent>
        {error === "link" && (
          <p role="alert" className="mb-4 rounded-xl bg-warning/15 px-3 py-2 text-sm text-warning-strong">
            That link has expired or was already used. Please try again.
          </p>
        )}
        <AuthForm action={signIn} submitLabel="Log in">
          <input type="hidden" name="next" value={next ?? "/today"} />
          <Field id="email" label="Email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field id="password" label="Password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Link href="/forgot-password" className="-mt-2 self-end text-xs text-muted-foreground hover:text-foreground">
            Forgot your password?
          </Link>
        </AuthForm>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to Daywise?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
