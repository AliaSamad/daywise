"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { savePreferences } from "@/app/actions/preferences";
import { loadDemoData } from "@/app/actions/demo";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AboutSection,
  DaySection,
  FocusSection,
  MealsSection,
  WeekendSection,
  type PrefsValue,
} from "@/components/preferences/fields";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Hi there! Let's get to know you", subtitle: "A few quick questions so your plans fit your life." },
  { title: "Your typical day", subtitle: "We'll only plan inside your waking and working hours." },
  { title: "Meals and breaks", subtitle: "Real schedules have lunch in them." },
  { title: "How you work best", subtitle: "We'll protect your energy, not just fill your time." },
  { title: "And weekends?", subtitle: "You can change all of this later in Settings." },
];

export function OnboardingWizard({ initial, timezoneIsDefault }: { initial: PrefsValue; timezoneIsDefault: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [value, setValue] = useState<PrefsValue>(initial);
  const [withDemo, setWithDemo] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!timezoneIsDefault) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) setValue((v) => ({ ...v, timezone: tz }));
  }, [timezoneIsDefault]);

  const onChange = (patch: Partial<PrefsValue>) => setValue((v) => ({ ...v, ...patch }));
  const last = step === STEPS.length - 1;

  function next() {
    if (step === 0 && !value.displayName.trim()) {
      toast.error("What should we call you?");
      return;
    }
    if (!last) {
      setStep((s) => s + 1);
      return;
    }
    start(async () => {
      const res = await savePreferences(value, true);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (withDemo) {
        const demo = await loadDemoData();
        if (!demo.ok) toast.error(demo.error);
      }
      toast.success(`You're all set, ${value.displayName.trim()}!`);
      router.replace("/today");
      router.refresh();
    });
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center px-4 py-8">
      <div aria-hidden className="pointer-events-none absolute -left-32 top-0 size-96 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-32 bottom-0 size-96 rounded-full bg-sage/20 blur-3xl" />
      <div className="relative w-full max-w-lg">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div className="mb-6 flex gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        <Card className="p-6 sm:p-8">
          <div key={step} className="animate-rise">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{STEPS[step].title}</h1>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">{STEPS[step].subtitle}</p>
            {step === 0 && <AboutSection value={value} onChange={onChange} />}
            {step === 1 && <DaySection value={value} onChange={onChange} />}
            {step === 2 && <MealsSection value={value} onChange={onChange} />}
            {step === 3 && <FocusSection value={value} onChange={onChange} />}
            {step === 4 && (
              <div className="flex flex-col gap-6">
                <WeekendSection value={value} onChange={onChange} />
                <div className="flex items-start gap-3 rounded-2xl bg-muted/60 p-4">
                  <Switch id="demo" checked={withDemo} onCheckedChange={setWithDemo} />
                  <div>
                    <Label htmlFor="demo">Start with sample data</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Adds an example week of lectures and tasks, clearly marked as samples. Remove it any time in Settings.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-8 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
              <ArrowLeft /> Back
            </Button>
            <Button onClick={next} disabled={pending} size="lg">
              {pending ? <Loader2 className="animate-spin" /> : last ? <Check /> : null}
              {last ? "Finish" : "Continue"}
              {!last && <ArrowRight />}
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
