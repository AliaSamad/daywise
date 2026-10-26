import { requireUser } from "@/lib/data/load";
import { AppProvider } from "@/components/app-context";
import { AppShell } from "@/components/app-shell";
import { categoryAccuracy, type EntryLike } from "@/lib/reality";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, prefs, tz } = await requireUser();
  const [{ data: entries }, { count: demoCount }] = await Promise.all([
    supabase.from("time_entries").select("minutes,estimated_minutes,category").order("created_at", { ascending: false }).limit(500),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("is_demo", true),
  ]);
  return (
    <AppProvider tz={tz} prefs={prefs} accuracy={categoryAccuracy((entries ?? []) as EntryLike[])} displayName={profile.display_name}>
      <AppShell demoActive={(demoCount ?? 0) > 0}>{children}</AppShell>
    </AppProvider>
  );
}
