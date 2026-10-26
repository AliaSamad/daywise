import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { Logo } from "@/components/logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Setup" };

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <Logo />
      <Card>
        <CardHeader>
          <CardTitle>Connect Supabase to get started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Daywise stores your schedule in Supabase. Add your project keys, then restart the dev server:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Create a project at supabase.com and run <code className="rounded bg-muted px-1">supabase/migrations</code>.</li>
            <li>Copy <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env.local</code>.</li>
            <li>Fill in <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>.</li>
          </ol>
          <p>The README has the full walkthrough.</p>
        </CardContent>
      </Card>
    </main>
  );
}
