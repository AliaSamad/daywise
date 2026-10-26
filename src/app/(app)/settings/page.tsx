import { requireUser } from "@/lib/data/load";
import { prefsValueFrom } from "@/components/preferences/initial";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { supabase, profile, prefsRow, user } = await requireUser();
  const [{ count: demoTasks }, { count: demoCommitments }] = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("is_demo", true),
    supabase.from("commitments").select("id", { count: "exact", head: true }).eq("is_demo", true),
  ]);
  return (
    <SettingsView
      initial={prefsValueFrom(profile, prefsRow)}
      email={user.email ?? ""}
      demoCount={(demoTasks ?? 0) + (demoCommitments ?? 0)}
    />
  );
}
