import { loadWorkspace, requireUser } from "@/lib/data/load";
import { addDaysLocal, localDateOf } from "@/lib/scheduler/time";
import { findCommitmentConflicts } from "@/lib/scheduler/conflicts";
import { CommitmentList } from "@/components/commitments/commitment-list";

export const metadata = { title: "Commitments" };
export const dynamic = "force-dynamic";

export default async function CommitmentsPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const ctx = await requireUser();
  const today = localDateOf(Date.now(), ctx.tz);
  // Look four weeks ahead for clashes.
  const ws = await loadWorkspace(ctx, today, addDaysLocal(today, 27));
  const conflicts = findCommitmentConflicts(ws.occurrences).map((c) => ({
    a: { id: c.a.commitmentId, title: c.a.title, date: c.a.date, start: c.a.start, end: c.a.end },
    b: { id: c.b.commitmentId, title: c.b.title, date: c.b.date, start: c.b.start, end: c.b.end },
    severity: c.severity,
  }));
  const nextOccurrence: Record<string, number> = {};
  for (const o of ws.occurrences) if (o.end > Date.now() && !(o.commitmentId in nextOccurrence)) nextOccurrence[o.commitmentId] = o.start;
  const { edit, new: isNew } = await searchParams;
  return (
    <CommitmentList
      rows={ws.commitmentRows}
      commitments={ws.commitments}
      conflicts={conflicts}
      nextOccurrence={nextOccurrence}
      editId={edit ?? null}
      openNew={isNew === "1"}
      today={today}
    />
  );
}
