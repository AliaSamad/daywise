"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createCommitment, deleteCommitment, updateCommitment } from "@/app/actions/commitments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useApp } from "@/components/app-context";
import { COMMITMENT_KIND_LABEL, WEEK_ORDER, WEEKDAY_SHORT } from "@/lib/labels";
import { addDaysLocal, localDateOf, weekdayOf } from "@/lib/scheduler/time";
import { expandCommitments } from "@/lib/scheduler/recurrence";
import { findCommitmentConflicts } from "@/lib/scheduler/conflicts";
import type { Commitment } from "@/lib/scheduler/types";
import type { CommitmentRow } from "@/lib/data/rows";
import { hhmm } from "@/lib/data/mappers";
import { fmtDayShort, fmtRange } from "@/lib/format";
import { cn } from "@/lib/utils";

type Repeat = "none" | "daily" | "weekly" | "fortnightly";

interface FormValue {
  title: string;
  kind: string;
  location: string;
  startDate: string;
  startTime: string;
  endTime: string;
  repeat: Repeat;
  weekdays: number[];
  untilDate: string;
  travelBefore: number;
  travelAfter: number;
  isMandatory: boolean;
  notes: string;
}

function fromRow(r: CommitmentRow | null, today: string, defaults?: Partial<FormValue>): FormValue {
  if (!r) {
    return {
      title: "",
      kind: "lecture",
      location: "",
      startDate: today,
      startTime: "10:00",
      endTime: "11:00",
      repeat: "none",
      weekdays: [weekdayOf(today)],
      untilDate: "",
      travelBefore: 0,
      travelAfter: 0,
      isMandatory: true,
      notes: "",
      ...defaults,
    };
  }
  const rr = r.recurrence_rules;
  return {
    title: r.title,
    kind: r.kind,
    location: r.location ?? "",
    startDate: r.start_date,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    repeat: !rr ? "none" : rr.freq === "daily" ? "daily" : rr.interval === 2 ? "fortnightly" : "weekly",
    weekdays: rr?.by_weekday?.length ? rr.by_weekday : [weekdayOf(r.start_date)],
    untilDate: rr?.until_date ?? "",
    travelBefore: r.travel_before_minutes,
    travelAfter: r.travel_after_minutes,
    isMandatory: r.is_mandatory,
    notes: r.notes ?? "",
  };
}

function toInput(v: FormValue) {
  const recurrence =
    v.repeat === "none"
      ? null
      : {
          freq: v.repeat === "daily" ? ("daily" as const) : ("weekly" as const),
          interval: v.repeat === "fortnightly" ? 2 : 1,
          byWeekday: v.repeat === "daily" ? null : v.weekdays,
          untilDate: v.untilDate,
        };
  return {
    title: v.title,
    kind: v.kind as "other",
    location: v.location,
    startDate: v.startDate,
    startTime: v.startTime,
    endTime: v.endTime,
    recurrence,
    travelBeforeMinutes: v.travelBefore,
    travelAfterMinutes: v.travelAfter,
    isMandatory: v.isMandatory,
    notes: v.notes,
  };
}

export function CommitmentDialog({
  open,
  onOpenChange,
  commitment,
  all,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitment?: CommitmentRow | null;
  /** Every commitment, used to warn about clashes before saving. */
  all: Commitment[];
  defaults?: Partial<FormValue>;
}) {
  const { tz } = useApp();
  const router = useRouter();
  const today = localDateOf(Date.now(), tz);
  const [v, setV] = useState<FormValue>(() => fromRow(commitment ?? null, today, defaults));
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<FormValue>) => setV((x) => ({ ...x, ...patch }));

  useEffect(() => {
    if (open) {
      setV(fromRow(commitment ?? null, today, defaults));
      setConfirmDelete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, commitment]);

  const crossesMidnight = v.endTime && v.startTime && v.endTime <= v.startTime;

  const clashes = useMemo(() => {
    if (!v.startDate || !v.startTime || !v.endTime || v.startTime === v.endTime) return [];
    const input = toInput(v);
    const draft: Commitment = {
      id: "__draft__",
      title: v.title || "This commitment",
      kind: v.kind,
      location: null,
      startDate: v.startDate,
      startTime: v.startTime,
      endTime: v.endTime,
      timezone: tz,
      recurrence: input.recurrence ? { ...input.recurrence, untilDate: input.recurrence.untilDate || null } : null,
      travelBeforeMinutes: v.travelBefore,
      travelAfterMinutes: v.travelAfter,
      isMandatory: v.isMandatory,
      exceptions: [],
    };
    const from = v.startDate > today ? v.startDate : today;
    const others = all.filter((c) => c.id !== commitment?.id);
    const occ = expandCommitments([draft, ...others], from, addDaysLocal(from, 56));
    return findCommitmentConflicts(occ)
      .filter((c) => c.a.commitmentId === "__draft__" || c.b.commitmentId === "__draft__")
      .slice(0, 4);
  }, [v, all, commitment?.id, tz, today]);

  function save() {
    if (!v.title.trim()) return toast.error("Give it a name.");
    if (v.repeat !== "none" && v.repeat !== "daily" && v.weekdays.length === 0) return toast.error("Pick at least one day.");
    start(async () => {
      const input = toInput(v);
      const res = commitment ? await updateCommitment(commitment.id, input) : await createCommitment(input);
      if (!res.ok) return void toast.error(res.error);
      toast.success(commitment ? "Commitment updated" : "Commitment added", {
        description: clashes.some((c) => c.severity === "overlap") ? "Heads up: it overlaps with something else." : undefined,
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  function remove() {
    if (!commitment) return;
    start(async () => {
      const res = await deleteCommitment(commitment.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Commitment deleted");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{commitment ? "Edit commitment" : "Add a commitment"}</DialogTitle>
          <DialogDescription>Fixed commitments are planned around and never moved without your say-so.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <Field id="c-title" label="What is it?">
              <Input id="c-title" value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Biology lecture" maxLength={120} autoFocus />
            </Field>
            <Field id="c-kind" label="Type">
              <NativeSelect id="c-kind" value={v.kind} onChange={(e) => set({ kind: e.target.value })}>
                {Object.entries(COMMITMENT_KIND_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field id="c-date" label={v.repeat === "none" ? "Date" : "Starting"} className="col-span-2 sm:col-span-1">
              <Input id="c-date" type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </Field>
            <Field id="c-start" label="Starts">
              <Input id="c-start" type="time" value={v.startTime} onChange={(e) => set({ startTime: e.target.value })} />
            </Field>
            <Field id="c-end" label="Ends" hint={crossesMidnight ? "Ends the next day" : undefined}>
              <Input id="c-end" type="time" value={v.endTime} onChange={(e) => set({ endTime: e.target.value })} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="c-repeat" label="Repeats">
              <NativeSelect id="c-repeat" value={v.repeat} onChange={(e) => set({ repeat: e.target.value as Repeat })}>
                <option value="none">Doesn&apos;t repeat</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="fortnightly">Every 2 weeks</option>
              </NativeSelect>
            </Field>
            {v.repeat !== "none" && (
              <Field id="c-until" label="Until (optional)">
                <Input id="c-until" type="date" value={v.untilDate} min={v.startDate} onChange={(e) => set({ untilDate: e.target.value })} />
              </Field>
            )}
          </div>

          {(v.repeat === "weekly" || v.repeat === "fortnightly") && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">On</legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEK_ORDER.map((d) => {
                  const on = v.weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ weekdays: on ? v.weekdays.filter((x) => x !== d) : [...v.weekdays, d] })}
                      className={cn(
                        "h-9 w-12 rounded-xl border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                      )}
                    >
                      {WEEKDAY_SHORT[d]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <Field id="c-location" label="Location (optional)">
            <Input id="c-location" value={v.location} onChange={(e) => set({ location: e.target.value })} maxLength={200} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="c-tb" label="Travel there">
              <NativeSelect id="c-tb" value={v.travelBefore} onChange={(e) => set({ travelBefore: Number(e.target.value) })}>
                {[0, 5, 10, 15, 20, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "None" : `${m} min`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="c-ta" label="Travel back">
              <NativeSelect id="c-ta" value={v.travelAfter} onChange={(e) => set({ travelAfter: Number(e.target.value) })}>
                {[0, 5, 10, 15, 20, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "None" : `${m} min`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/50 p-3.5">
            <div>
              <Label htmlFor="c-mandatory">Mandatory</Label>
              <p className="text-xs text-muted-foreground">Optional commitments may be suggested as things to skip when time is tight.</p>
            </div>
            <Switch id="c-mandatory" checked={v.isMandatory} onCheckedChange={(isMandatory) => set({ isMandatory })} />
          </div>

          <Field id="c-notes" label="Notes (optional)">
            <Textarea id="c-notes" rows={2} value={v.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} />
          </Field>

          {clashes.length > 0 && (
            <div role="status" className="rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-sm">
              <p className="flex items-center gap-2 font-medium text-warning-strong">
                <AlertTriangle className="size-4" /> This clashes with other commitments
              </p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {clashes.map((c, i) => {
                  const other = c.a.commitmentId === "__draft__" ? c.b : c.a;
                  return (
                    <li key={i}>
                      {fmtDayShort(other.date)} · {other.title} ({fmtRange(other.start, other.end, tz)})
                      {c.severity === "travel" ? " — travel time overlaps" : ""}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">You can still save it — clashes are flagged on your calendar.</p>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {commitment ? (
            confirmDelete ? (
              <Button variant="destructive" onClick={remove} disabled={pending}>
                <Trash2 /> Confirm delete{v.repeat !== "none" ? " all repeats" : ""}
              </Button>
            ) : (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={pending}>
                <Trash2 /> Delete
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {commitment ? "Save changes" : "Add commitment"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
