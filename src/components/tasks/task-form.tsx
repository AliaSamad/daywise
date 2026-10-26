"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CATEGORY_LABEL, PRIORITY_LABEL } from "@/lib/labels";
import { localDateOf } from "@/lib/scheduler/time";
import { fmtTime } from "@/lib/format";
import type { TaskRow } from "@/lib/data/rows";
import { cn } from "@/lib/utils";

export interface TaskFormValue {
  title: string;
  description: string;
  hours: number;
  minutes: number;
  deadlineDate: string;
  deadlineTime: string;
  priority: TaskRow["priority"];
  category: TaskRow["category"];
  customCategory: string;
  splittable: boolean;
  minSessionMinutes: number;
  earliestStart: string;
  preferredTime: "" | "morning" | "afternoon" | "evening";
  status: TaskRow["status"];
}

export function emptyTaskForm(): TaskFormValue {
  return {
    title: "",
    description: "",
    hours: 1,
    minutes: 0,
    deadlineDate: "",
    deadlineTime: "",
    priority: "medium",
    category: "study",
    customCategory: "",
    splittable: true,
    minSessionMinutes: 25,
    earliestStart: "",
    preferredTime: "",
    status: "not_started",
  };
}

export function taskFormFrom(t: TaskRow, tz: string): TaskFormValue {
  const deadline = t.deadline ? Date.parse(t.deadline) : null;
  return {
    title: t.title,
    description: t.description ?? "",
    hours: Math.floor(t.estimated_minutes / 60),
    minutes: t.estimated_minutes % 60,
    deadlineDate: deadline ? localDateOf(deadline, tz) : "",
    deadlineTime: deadline ? fmtTime(deadline, tz) : "",
    priority: t.priority,
    category: t.category,
    customCategory: t.custom_category ?? "",
    splittable: t.splittable,
    minSessionMinutes: t.min_session_minutes,
    earliestStart: t.earliest_start ?? "",
    preferredTime: t.preferred_time ?? "",
    status: t.status,
  };
}

export function toTaskInput(v: TaskFormValue) {
  return {
    title: v.title,
    description: v.description,
    estimatedMinutes: v.hours * 60 + v.minutes,
    deadlineDate: v.deadlineDate,
    deadlineTime: v.deadlineTime,
    priority: v.priority,
    category: v.category,
    customCategory: v.customCategory,
    splittable: v.splittable,
    minSessionMinutes: v.minSessionMinutes,
    earliestStart: v.earliestStart,
    preferredTime: v.preferredTime,
  };
}

export function TaskForm({
  value,
  onChange,
  idPrefix = "task",
  suggestion,
}: {
  value: TaskFormValue;
  onChange: (patch: Partial<TaskFormValue>) => void;
  idPrefix?: string;
  suggestion?: React.ReactNode;
}) {
  const [advanced, setAdvanced] = useState(false);
  const id = (s: string) => `${idPrefix}-${s}`;
  return (
    <div className="flex flex-col gap-4">
      <Field id={id("title")} label="Task">
        <Input
          id={id("title")}
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="e.g. Write lab report"
          autoFocus
          maxLength={160}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("hours")}>How long will it take?</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id={id("hours")}
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                value={value.hours}
                onChange={(e) => onChange({ hours: Math.max(0, Number(e.target.value) || 0) })}
                aria-label="Hours"
                className="pr-7"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">h</span>
            </div>
            <div className="relative flex-1">
              <NativeSelect
                id={id("minutes")}
                value={value.minutes}
                onChange={(e) => onChange({ minutes: Number(e.target.value) })}
                aria-label="Minutes"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <option key={m} value={m}>
                    {m}m
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          {suggestion}
        </div>
        <Field id={id("priority")} label="Priority">
          <NativeSelect
            id={id("priority")}
            value={value.priority}
            onChange={(e) => onChange({ priority: e.target.value as TaskFormValue["priority"] })}
          >
            {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id={id("deadline")} label="Deadline">
          <Input id={id("deadline")} type="date" value={value.deadlineDate} onChange={(e) => onChange({ deadlineDate: e.target.value })} />
        </Field>
        <Field id={id("deadlineTime")} label="Time" hint={value.deadlineDate && !value.deadlineTime ? "End of day" : undefined}>
          <Input
            id={id("deadlineTime")}
            type="time"
            value={value.deadlineTime}
            disabled={!value.deadlineDate}
            onChange={(e) => onChange({ deadlineTime: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id={id("category")} label="Category">
          <NativeSelect
            id={id("category")}
            value={value.category}
            onChange={(e) => onChange({ category: e.target.value as TaskFormValue["category"] })}
          >
            {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {value.category === "custom" ? (
          <Field id={id("custom")} label="Category name">
            <Input id={id("custom")} value={value.customCategory} maxLength={40} onChange={(e) => onChange({ customCategory: e.target.value })} />
          </Field>
        ) : (
          <div />
        )}
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        aria-expanded={advanced}
        className="flex items-center gap-1 self-start rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className={cn("size-4 transition-transform", advanced && "rotate-180")} />
        More options
      </button>

      {advanced && (
        <div className="flex animate-rise flex-col gap-4 rounded-2xl bg-muted/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor={id("split")}>Can be split into sessions</Label>
              <p className="text-xs text-muted-foreground">Turn off for things you need to do in one go.</p>
            </div>
            <Switch id={id("split")} checked={value.splittable} onCheckedChange={(splittable) => onChange({ splittable })} />
          </div>
          {value.splittable && (
            <Field id={id("minSession")} label="Shortest useful session">
              <NativeSelect
                id={id("minSession")}
                value={value.minSessionMinutes}
                onChange={(e) => onChange({ minSessionMinutes: Number(e.target.value) })}
              >
                {[15, 20, 25, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field id={id("earliest")} label="Don't start before">
              <Input id={id("earliest")} type="date" value={value.earliestStart} onChange={(e) => onChange({ earliestStart: e.target.value })} />
            </Field>
            <Field id={id("pref")} label="Best time of day">
              <NativeSelect
                id={id("pref")}
                value={value.preferredTime}
                onChange={(e) => onChange({ preferredTime: e.target.value as TaskFormValue["preferredTime"] })}
              >
                <option value="">Any time</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </NativeSelect>
            </Field>
          </div>
          <Field id={id("desc")} label="Notes">
            <Textarea id={id("desc")} value={value.description} maxLength={4000} onChange={(e) => onChange({ description: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
}
