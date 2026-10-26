"use client";

import { Briefcase, GraduationCap, Moon, Sun, Sunrise } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/scheduler/time";

export type PrefsValue = {
  displayName: string;
  userType: "student" | "working";
  timezone: string;
  wakeTime: string;
  bedTime: string;
  workStart: string;
  workEnd: string;
  breakfastTime: string | null;
  lunchTime: string | null;
  dinnerTime: string | null;
  mealMinutes: number;
  breakMinutes: number;
  focusPreference: "morning" | "afternoon" | "evening";
  maxFocusMinutes: number;
  sessionMinutes: number;
  weekendMode: "work" | "light" | "rest";
  bufferPercent: number;
  windDownMinutes: number;
};

export interface SectionProps {
  value: PrefsValue;
  onChange: (patch: Partial<PrefsValue>) => void;
}

function ChoiceCards<T extends string>({
  name,
  value,
  onChange,
  options,
  columns = 3,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; description?: string; icon?: React.ComponentType<{ className?: string }> }[];
  columns?: 2 | 3;
}) {
  return (
    <div role="radiogroup" aria-label={name} className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-primary bg-primary/10 shadow-soft" : "border-border bg-card hover:bg-muted",
            )}
          >
            {Icon && <Icon className={cn("mb-1 size-5", active ? "text-primary" : "text-muted-foreground")} />}
            <span className="text-sm font-medium">{o.label}</span>
            {o.description && <span className="text-xs text-muted-foreground">{o.description}</span>}
          </button>
        );
      })}
    </div>
  );
}

function timezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney"];
  }
}

export function AboutSection({ value, onChange, showTimezone = true }: SectionProps & { showTimezone?: boolean }) {
  const zones = timezones();
  if (!zones.includes(value.timezone)) zones.unshift(value.timezone);
  return (
    <div className="flex flex-col gap-5">
      <Field id="displayName" label="What should we call you?">
        <Input id="displayName" value={value.displayName} onChange={(e) => onChange({ displayName: e.target.value })} autoComplete="given-name" />
      </Field>
      <div className="flex flex-col gap-2">
        <Label>Which best describes you?</Label>
        <ChoiceCards
          name="I am a"
          columns={2}
          value={value.userType}
          onChange={(userType) => onChange({ userType })}
          options={[
            { value: "student", label: "Student", description: "Lectures, seminars, deadlines", icon: GraduationCap },
            { value: "working", label: "Working adult", description: "Shifts, meetings, life admin", icon: Briefcase },
          ]}
        />
      </div>
      {showTimezone && (
        <Field id="timezone" label="Time zone" hint="Detected from your device. Daylight saving is handled automatically.">
          <NativeSelect id="timezone" value={value.timezone} onChange={(e) => onChange({ timezone: e.target.value })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
    </div>
  );
}

export function DaySection({ value, onChange }: SectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Field id="wakeTime" label="I usually wake up at">
          <Input id="wakeTime" type="time" value={value.wakeTime} onChange={(e) => onChange({ wakeTime: e.target.value })} />
        </Field>
        <Field id="bedTime" label="And go to bed at">
          <Input id="bedTime" type="time" value={value.bedTime} onChange={(e) => onChange({ bedTime: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="workStart" label="I prefer to work from">
          <Input id="workStart" type="time" value={value.workStart} onChange={(e) => onChange({ workStart: e.target.value })} />
        </Field>
        <Field id="workEnd" label="Until">
          <Input id="workEnd" type="time" value={value.workEnd} onChange={(e) => onChange({ workEnd: e.target.value })} />
        </Field>
      </div>
      <Field id="windDown" label="Protected wind-down before bed" hint="Nothing gets scheduled in this time.">
        <NativeSelect id="windDown" value={value.windDownMinutes} onChange={(e) => onChange({ windDownMinutes: Number(e.target.value) })}>
          {[0, 30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m === 0 ? "None" : formatDuration(m)}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </div>
  );
}

function MealRow({
  id,
  label,
  time,
  fallback,
  onChange,
}: {
  id: string;
  label: string;
  time: string | null;
  fallback: string;
  onChange: (t: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <Switch id={`${id}-on`} checked={time !== null} onCheckedChange={(on) => onChange(on ? fallback : null)} aria-label={`Include ${label}`} />
      <Label htmlFor={`${id}-on`} className="flex-1">
        {label}
      </Label>
      <Input
        id={id}
        type="time"
        aria-label={`${label} time`}
        className="w-32"
        disabled={time === null}
        value={time ?? fallback}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function MealsSection({ value, onChange }: SectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <MealRow id="breakfast" label="Breakfast" time={value.breakfastTime} fallback="08:00" onChange={(breakfastTime) => onChange({ breakfastTime })} />
        <MealRow id="lunch" label="Lunch" time={value.lunchTime} fallback="12:30" onChange={(lunchTime) => onChange({ lunchTime })} />
        <MealRow id="dinner" label="Dinner" time={value.dinnerTime} fallback="18:30" onChange={(dinnerTime) => onChange({ dinnerTime })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="mealMinutes" label="Meals take about">
          <NativeSelect id="mealMinutes" value={value.mealMinutes} onChange={(e) => onChange({ mealMinutes: Number(e.target.value) })}>
            {[15, 20, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {formatDuration(m)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="breakMinutes" label="Breaks between sessions">
          <NativeSelect id="breakMinutes" value={value.breakMinutes} onChange={(e) => onChange({ breakMinutes: Number(e.target.value) })}>
            {[5, 10, 15, 20, 30].map((m) => (
              <option key={m} value={m}>
                {formatDuration(m)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
    </div>
  );
}

export function FocusSection({ value, onChange }: SectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>When do you focus best?</Label>
        <ChoiceCards
          name="Best focus time"
          value={value.focusPreference}
          onChange={(focusPreference) => onChange({ focusPreference })}
          options={[
            { value: "morning", label: "Morning", icon: Sunrise },
            { value: "afternoon", label: "Afternoon", icon: Sun },
            { value: "evening", label: "Evening", icon: Moon },
          ]}
        />
      </div>
      <Field
        id="maxFocus"
        label={`Most focused work I'm comfortable with in a day: ${formatDuration(value.maxFocusMinutes)}`}
        hint="Daywise won't plan more than this, even when there's room."
      >
        <input
          id="maxFocus"
          type="range"
          min={60}
          max={600}
          step={30}
          value={value.maxFocusMinutes}
          onChange={(e) => onChange({ maxFocusMinutes: Number(e.target.value) })}
          className="accent-[var(--primary)]"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="sessionMinutes" label="Ideal session length">
          <NativeSelect id="sessionMinutes" value={value.sessionMinutes} onChange={(e) => onChange({ sessionMinutes: Number(e.target.value) })}>
            {[25, 30, 45, 50, 60, 75, 90, 120].map((m) => (
              <option key={m} value={m}>
                {formatDuration(m)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="buffer" label="Buffer for the unexpected">
          <NativeSelect id="buffer" value={value.bufferPercent} onChange={(e) => onChange({ bufferPercent: Number(e.target.value) })}>
            {[0, 10, 15, 20, 25, 30].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "None" : `${m}% of free time`}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
    </div>
  );
}

export function WeekendSection({ value, onChange }: SectionProps) {
  return (
    <ChoiceCards
      name="Weekends"
      value={value.weekendMode}
      onChange={(weekendMode) => onChange({ weekendMode })}
      options={[
        { value: "rest", label: "Rest days", description: "Keep weekends free of tasks" },
        { value: "light", label: "Light days", description: "Up to half a normal workload" },
        { value: "work", label: "Workdays", description: "Treat them like any other day" },
      ]}
    />
  );
}
