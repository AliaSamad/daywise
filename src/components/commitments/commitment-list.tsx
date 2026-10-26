"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, Car, MapPin, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useApp } from "@/components/app-context";
import { CommitmentDialog } from "./commitment-dialog";
import type { CommitmentRow } from "@/lib/data/rows";
import type { Commitment } from "@/lib/scheduler/types";
import { describeRecurrence } from "@/lib/scheduler/recurrence";
import { localDateOf } from "@/lib/scheduler/time";
import { hhmm } from "@/lib/data/mappers";
import { COMMITMENT_KIND_LABEL } from "@/lib/labels";
import { fmtDayShort, fmtRange } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ConflictView {
  a: { id: string; title: string; date: string; start: number; end: number };
  b: { id: string; title: string; date: string; start: number; end: number };
  severity: "overlap" | "travel";
}

export function CommitmentList({
  rows,
  commitments,
  conflicts,
  nextOccurrence,
  editId,
  openNew,
  today,
}: {
  rows: CommitmentRow[];
  commitments: Commitment[];
  conflicts: ConflictView[];
  nextOccurrence: Record<string, number>;
  editId: string | null;
  openNew: boolean;
  today: string;
}) {
  const { tz } = useApp();
  const router = useRouter();
  const [dialog, setDialog] = useState<{ row: CommitmentRow | null } | null>(null);

  useEffect(() => {
    if (editId) {
      const row = rows.find((r) => r.id === editId);
      if (row) setDialog({ row });
    } else if (openNew) setDialog({ row: null });
  }, [editId, openNew, rows]);

  const recurring = rows.filter((r) => r.recurrence_rules);
  const upcoming = rows.filter((r) => !r.recurrence_rules && r.start_date >= today);
  const past = rows.filter((r) => !r.recurrence_rules && r.start_date < today);
  const overlaps = conflicts.filter((c) => c.severity === "overlap");
  const clashIds = new Set(overlaps.flatMap((c) => [c.a.id, c.b.id]));

  function close() {
    setDialog(null);
    if (editId || openNew) router.replace("/commitments");
  }

  const section = (title: string, list: CommitmentRow[]) =>
    list.length === 0 ? null : (
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title} <span className="font-normal">· {list.length}</span>
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((r) => {
            const c = commitments.find((x) => x.id === r.id)!;
            const next = nextOccurrence[r.id];
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setDialog({ row: r })}
                  className={cn(
                    "flex w-full flex-col gap-2 rounded-3xl border border-border/70 bg-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    clashIds.has(r.id) && "border-destructive/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.title}</p>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {hhmm(r.start_time)} – {hhmm(r.end_time)}
                        {r.end_time <= r.start_time && " (+1 day)"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {r.is_demo && <Badge variant="warning">Sample</Badge>}
                      <Badge variant={r.is_mandatory ? "blue" : "outline"}>{r.is_mandatory ? "Mandatory" : "Optional"}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Repeat className="size-3" aria-hidden /> {describeRecurrence(c)}
                      {!r.recurrence_rules && ` · ${fmtDayShort(r.start_date)}`}
                    </span>
                    <span>{COMMITMENT_KIND_LABEL[r.kind] ?? r.kind}</span>
                    {r.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden /> {r.location}
                      </span>
                    )}
                    {(r.travel_before_minutes > 0 || r.travel_after_minutes > 0) && (
                      <span className="flex items-center gap-1">
                        <Car className="size-3" aria-hidden /> {r.travel_before_minutes}/{r.travel_after_minutes} min
                      </span>
                    )}
                  </div>
                  {next && r.recurrence_rules && <p className="text-xs text-muted-foreground">Next: {fmtDayShort(localDateOf(next, tz))}</p>}
                  {clashIds.has(r.id) && (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="size-3" /> Overlaps another commitment
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">The fixed parts of your week — planned around, never moved.</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Commitments</h1>
        </div>
        <Button size="lg" onClick={() => setDialog({ row: null })}>
          <Plus /> Add commitment
        </Button>
      </header>

      {overlaps.length > 0 && (
        <Card className="border-destructive/30 p-4">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4" /> {overlaps.length} clash{overlaps.length === 1 ? "" : "es"} in the next four weeks
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {overlaps.slice(0, 5).map((c, i) => (
              <li key={i}>
                {fmtDayShort(c.a.date)}: <span className="text-foreground">{c.a.title}</span> ({fmtRange(c.a.start, c.a.end, tz)}) and{" "}
                <span className="text-foreground">{c.b.title}</span> ({fmtRange(c.b.start, c.b.end, tz)})
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Edit one of them, or cancel a single occurrence from the calendar.</p>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-blue/20">
            <CalendarPlus className="size-5 text-blue-strong" />
          </span>
          <p className="font-medium">No commitments yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add lectures, shifts, classes and appointments. Daywise plans your tasks around them — including travel time.
          </p>
          <Button onClick={() => setDialog({ row: null })}>
            <Plus /> Add your first commitment
          </Button>
        </Card>
      ) : (
        <>
          {section("Repeating", recurring)}
          {section("Upcoming", upcoming)}
          {section("Past", past)}
        </>
      )}

      <CommitmentDialog open={!!dialog} onOpenChange={(o) => !o && close()} commitment={dialog?.row ?? null} all={commitments} />
    </div>
  );
}
