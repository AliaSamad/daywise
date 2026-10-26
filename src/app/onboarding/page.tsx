import { redirect } from "next/navigation";
import { requireUser } from "@/lib/data/load";
import { prefsValueFrom } from "@/components/preferences/initial";
import { OnboardingWizard } from "./wizard";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const { profile, prefsRow, user } = await requireUser(true);
  if (profile.onboarded_at) redirect("/today");
  const name = (user.user_metadata?.display_name as string | undefined) ?? "";
  return <OnboardingWizard initial={prefsValueFrom(profile, prefsRow, name)} timezoneIsDefault={profile.timezone === "UTC"} />;
}
