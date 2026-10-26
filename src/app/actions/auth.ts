"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { fail, ok, type ActionResult } from "./result";

const email = z.string().trim().email("Enter a valid email address");
const password = z.string().min(8, "Use at least 8 characters").max(72);

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/today";
}

export async function signIn(_: unknown, form: FormData): Promise<ActionResult> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password") }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return fail(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: unknown, form: FormData): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = z
    .object({ name: z.string().trim().min(1, "Tell us your name").max(80), email, password })
    .safeParse({ name: form.get("name"), email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.name },
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/onboarding`,
    },
  });
  if (error) return fail(error.message);
  if (data.session) redirect("/onboarding");
  return ok({ needsConfirmation: true });
}

export async function requestPasswordReset(_: unknown, form: FormData): Promise<ActionResult> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/reset-password`,
  });
  // Don't reveal whether an account exists.
  if (error && !/not found/i.test(error.message)) return fail(error.message);
  return ok(undefined);
}

export async function updatePassword(_: unknown, form: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "The passwords don't match", path: ["confirm"] })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(error.message);
  return ok(undefined);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Permanently delete the account and every row that belongs to it. */
export async function deleteAccount(confirmation: string): Promise<ActionResult> {
  if (confirmation !== "DELETE") return fail('Type DELETE to confirm.');
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return fail(error.message);
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
