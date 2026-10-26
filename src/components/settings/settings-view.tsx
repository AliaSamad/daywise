"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2, LogOut, Palette, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { savePreferences } from "@/app/actions/preferences";
import { clearDemoData, loadDemoData } from "@/app/actions/demo";
import { deleteAccount, signOut, updatePassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AboutSection, DaySection, FocusSection, MealsSection, WeekendSection, type PrefsValue } from "@/components/preferences/fields";

export function SettingsView({ initial, email, demoCount }: { initial: PrefsValue; email: string; demoCount: number }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saving, startSave] = useTransition();
  const [demoPending, startDemo] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, startDelete] = useTransition();
  const [pwState, pwAction, pwPending] = useActionState(updatePassword, null);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const onChange = (patch: Partial<PrefsValue>) => setValue((v) => ({ ...v, ...patch }));

  function save() {
    startSave(async () => {
      const res = await savePreferences(value, false);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Preferences saved", { description: "They'll be used the next time you plan." });
      router.refresh();
    });
  }

  function demo(load: boolean) {
    startDemo(async () => {
      const res = load ? await loadDemoData() : await clearDemoData();
      if (!res.ok) return void toast.error(res.error);
      toast.success(load ? "Sample data loaded" : "Sample data removed", { description: load ? undefined : "Everything you created is untouched." });
      router.refresh();
    });
  }

  const section = (title: string, description: string, body: React.ReactNode) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Everything here can be changed at any time.</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {section("About you", "Your name, role and time zone.", <AboutSection value={value} onChange={onChange} />)}
        {section("Your day", "Daywise only schedules inside these hours.", <DaySection value={value} onChange={onChange} />)}
        {section("Meals and breaks", "Protected time that's never filled with tasks.", <MealsSection value={value} onChange={onChange} />)}
        {section("Focus", "How much work feels sustainable for you.", <FocusSection value={value} onChange={onChange} />)}
        {section("Weekends", "How Saturdays and Sundays are planned.", <WeekendSection value={value} onChange={onChange} />)}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-4" /> Appearance
            </CardTitle>
            <CardDescription>Light, dark, or follow your device.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-24 z-20 flex justify-end lg:bottom-6">
        <Button size="lg" onClick={save} disabled={!dirty || saving} className="shadow-lg">
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {dirty ? "Save preferences" : "Saved"}
        </Button>
      </div>

      <Card id="demo">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4" /> Sample data
          </CardTitle>
          <CardDescription>
            A labelled example week, stored separately from your own tasks and commitments.
            {demoCount > 0 ? ` ${demoCount} sample items are loaded.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {demoCount > 0 ? (
            <Button variant="outline" onClick={() => demo(false)} disabled={demoPending}>
              {demoPending && <Loader2 className="animate-spin" />}
              Remove sample data
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => demo(true)} disabled={demoPending}>
              {demoPending && <Loader2 className="animate-spin" />}
              Load sample data
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Signed in as {email}</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={pwAction} className="flex flex-col gap-3">
              <Field id="new-password" label="New password" hint="At least 8 characters.">
                <Input id="new-password" name="password" type="password" autoComplete="new-password" />
              </Field>
              <Field id="confirm-password" label="Confirm new password">
                <Input id="confirm-password" name="confirm" type="password" autoComplete="new-password" />
              </Field>
              {pwState && (
                <p role="status" className={pwState.ok ? "text-sm text-sage-strong" : "text-sm text-destructive"}>
                  {pwState.ok ? "Password updated." : pwState.error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="secondary" disabled={pwPending}>
                  {pwPending && <Loader2 className="animate-spin" />}
                  Change password
                </Button>
                <Button type="button" variant="ghost" onClick={() => void signOut()}>
                  <LogOut /> Log out
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-4" /> Delete account
            </CardTitle>
            <CardDescription>Permanently deletes your account, tasks, commitments, plans and history. This can&apos;t be undone.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete my account
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete everything?</DialogTitle>
            <DialogDescription>All of your data will be removed immediately. Type DELETE to confirm.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Type DELETE to confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "DELETE" || deleting}
              onClick={() =>
                startDelete(async () => {
                  const res = await deleteAccount(confirmText);
                  if (res && !res.ok) toast.error(res.error);
                })
              }
            >
              {deleting && <Loader2 className="animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
