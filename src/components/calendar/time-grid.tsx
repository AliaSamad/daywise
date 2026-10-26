"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Coffee,
  CornerDownRight,
  MapPin,
  MoveVertical,
  Pencil,
  Pin,
  PinOff,
  SkipForward,
  Trash2,
  Utensils,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { removeSession, setSessionStatus, unlockSession } from "@/app/actions/sessions";
import { setOccurrenceSkipped } from "@/app/actions/commitments";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApp } from "@/components/app-context";
import { CompleteTaskDialog, type CompleteTarget } from "@/components/tasks/complete-task-dialog";
import type { CalendarItem } from "@/lib/calendar/items";
import { validateSessionMove } from "@/lib/scheduler/conflicts";
import { buildDayFrame } from "@/lib/scheduler/day";
import { localMinutesOf, MINUTE, minutesToTime, zonedInstant, type LocalDate } from "@/lib/scheduler/time";
import type { CommitmentOccurrence } from "@/lib/scheduler/types";
import { fmtRange, fmtTime, fmtWeekday } from "@/lib/format";
import { COMMITMENT_KIND_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { MoveDialog } from "./move-dialog";
import { useSessionMover, type MoveRequest } from "./use-session-mover";

const SNAP = 15;

interface Placed {
  item: CalendarItem;
  col: number;
  top: number; // minutes from grid start
  height: number; // minutes
  lane: number;
  lanes: number;
}

interface DragState {
  key: string;
  startX: number;
  startY: number;
  deltaMin: number;
  deltaCol: number;
  moved: boolean;
  invalid: boolean;
}

export function TimeGrid({
  days,
  items,
  now,
  tasks,
  hourHeight = 56,
  showHeaders = true,
  className,
}: {
  days: LocalDate[];
  items: CalendarItem[];
  now: number;
  tasks: { id: string; title: string; estimatedMinutes: number }[];
  hourHeight?: number;
  showHeaders?: boolean;
  className?: string;
}) {
  const { tz, prefs } = useApp();
  const router = useRouter();
  const pxPerMin = hourHeight / 60;
  const mover = useSessionMover();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveRequest | null>(null);
  const [completeTarget, setCompleteTarget] = useState<CompleteTarget | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [, startAction] = useTransition();
  const columnsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const midnights = useMemo(() => days.map((d) => zonedInstant(d, "00:00", tz)), [days, tz]);

  // Visible range: from just before the earliest wake-up to just after the latest bedtime.
  const { gridStart, gridEnd } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    days.forEach((d, i) => {
      const f = buildDayFrame(d, prefs, tz);
      lo = Math.min(lo, (f.awake.start - midnights[i]) / MINUTE);
      hi = Math.max(hi, (f.awake.end + prefs.windDownMinutes * MINUTE - midnights[i]) / MINUTE);
    });
    for (const it of items) {
      const i = days.findIndex((_, k) => it.start >= midnights[k] && it.start < midnights[k] + 86_400_000);
      if (i < 0) continue;
      lo = Math.min(lo, (it.blockStart - midnights[i]) / MINUTE);
      hi = Math.max(hi, Math.min((it.blockEnd - midnights[i]) / MINUTE, 36 * 60));
    }
    if (!Number.isFinite(lo)) lo = 7 * 60;
    if (!Number.isFinite(hi)) hi = 23 * 60;
    return { gridStart: Math.max(0, Math.floor(lo / 60) * 60 - 60), gridEnd: Math.min(36 * 60, Math.ceil(hi / 60) * 60 + 30) };
  }, [days, items, midnights, prefs, tz]);

  const placed = useMemo(() => layout(items, days, midnights, gridStart, gridEnd, mover.optimistic), [items, days, midnights, gridStart, gridEnd, mover.optimistic]);

  // Bring "now" (or the start of the working day) into view on first render.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const i = days.findIndex((_, k) => now >= midnights[k] && now < midnights[k] + 86_400_000);
    const focusMin = i >= 0 ? (now - midnights[i]) / MINUTE - 90 : buildDayFrame(days[0], prefs, tz).awake.start / MINUTE - midnights[0] / MINUTE;
    el.scrollTop = Math.max(0, (focusMin - gridStart) * pxPerMin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const occurrences: CommitmentOccurrence[] = useMemo(
    () =>
      items
        .filter((i) => i.type === "commitment")
        .map((i) => ({
          commitmentId: i.commitmentId!,
          title: i.title,
          kind: i.kind ?? "other",
          location: i.location ?? null,
          isMandatory: !!i.isMandatory,
          date: i.occurrenceDate!,
          start: i.start,
          end: i.end,
          blockStart: i.blockStart,
          blockEnd: i.blockEnd,
        })),
    [items],
  );
  const otherSessions = useMemo(
    () =>
      items
        .filter((i) => (i.type === "task" || i.type === "break") && i.sessionId)
        .map((i) => ({ id: i.sessionId!, kind: i.type as "task" | "break", title: i.title, start: i.start, end: i.end })),
    [items],
  );

  function targetFor(p: Placed, deltaMin: number, deltaCol: number): MoveRequest | null {
    const col = p.col + deltaCol;
    if (col < 0 || col >= days.length) return null;
    const offset = (p.item.start - midnights[p.col]) / MINUTE + deltaMin;
    const start = midnights[col] + offset * MINUTE;
    return { sessionId: p.item.sessionId!, title: p.item.title, start, end: start + (p.item.end - p.item.start) };
  }

  function quickCheck(req: MoveRequest, deadline: number | null | undefined) {
    return validateSessionMove({
      move: { sessionId: req.sessionId, taskTitle: req.title, start: req.start, end: req.end, deadline: deadline ?? null },
      now: Date.now(),
      tz,
      prefs,
      occurrences,
      sessions: otherSessions,
    });
  }

  function canDrag(it: CalendarItem) {
    return it.type === "task" && it.status !== "done" && !it.taskCompleted && !!it.sessionId;
  }

  function onPointerDown(e: React.PointerEvent, p: Placed) {
    if (!canDrag(p.item) || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ key: p.item.key, startX: e.clientX, startY: e.clientY, deltaMin: 0, deltaCol: 0, moved: false, invalid: false });
  }

  function onPointerMove(e: React.PointerEvent, p: Placed) {
    if (!drag || drag.key !== p.item.key) return;
    const dy = e.clientY - drag.startY;
    const dx = e.clientX - drag.startX;
    const moved = drag.moved || Math.abs(dy) > 4 || Math.abs(dx) > 6;
    const colWidth = columnsRef.current ? columnsRef.current.clientWidth / days.length : 1;
    const deltaMin = Math.round(dy / pxPerMin / SNAP) * SNAP;
    const deltaCol = days.length > 1 ? Math.round(dx / colWidth) : 0;
    const req = targetFor(p, deltaMin, deltaCol);
    const invalid = !req || quickCheck(req, p.item.deadline).errors.length > 0;
    setDrag({ ...drag, deltaMin, deltaCol, moved, invalid });
  }

  function onPointerUp(e: React.PointerEvent, p: Placed) {
    if (!drag || drag.key !== p.item.key) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      setMenuKey(p.item.key);
      return;
    }
    if (d.deltaMin === 0 && d.deltaCol === 0) return;
    const req = targetFor(p, d.deltaMin, d.deltaCol);
    if (!req) return;
    const check = quickCheck(req, p.item.deadline);
    if (check.errors.length) {
      toast.error("Can't move it there", { description: check.errors.join(" ") });
      return;
    }
    mover.requestMove(req);
  }

  function onKeyDown(e: React.KeyboardEvent, p: Placed) {
    if (!canDrag(p.item) || !e.altKey) return;
    const map: Record<string, [number, number]> = {
      ArrowUp: [-SNAP, 0],
      ArrowDown: [SNAP, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const delta = map[e.key];
    if (!delta) return;
    e.preventDefault();
    const req = targetFor(p, delta[0], delta[1]);
    if (!req) return;
    const check = quickCheck(req, p.item.deadline);
    if (check.errors.length) return void toast.error("Can't move it there", { description: check.errors.join(" ") });
    mover.requestMove(req);
  }

  function withDragTimes(p: Placed, deltaMin: number, deltaCol: number): CalendarItem {
    const req = targetFor(p, deltaMin, deltaCol);
    return req ? { ...p.item, start: req.start, end: req.end } : p.item;
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startAction(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
      toast.success(success);
      router.refresh();
    });
  }

  const hours: number[] = [];
  for (let m = gridStart; m <= gridEnd; m += 60) hours.push(m);
  const height = (gridEnd - gridStart) * pxPerMin;
  const nowCol = days.findIndex((_, k) => now >= midnights[k] && now < midnights[k] + 86_400_000);
  const nowTop = nowCol >= 0 ? ((now - midnights[nowCol]) / MINUTE - gridStart) * pxPerMin : -1;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {showHeaders && days.length > 1 && (
        <div className="flex border-b border-border pb-2 pl-12">
          {days.map((d, i) => (
            <div key={d} className={cn("flex-1 text-center text-xs", i === nowCol ? "font-semibold text-primary" : "text-muted-foreground")}>
              <span className="block uppercase tracking-wide">{fmtWeekday(d)}</span>
              <span className={cn("mt-0.5 inline-flex size-7 items-center justify-center rounded-full text-sm", i === nowCol && "bg-primary text-primary-foreground")}>
                {Number(d.slice(8))}
              </span>
            </div>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="relative flex" style={{ height }}>
          <div className="relative w-12 shrink-0 select-none" aria-hidden>
            {hours.map((m) => (
              <span key={m} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground" style={{ top: (m - gridStart) * pxPerMin }}>
                {m === gridStart ? "" : minutesToTime(m)}
              </span>
            ))}
          </div>
          <div
            ref={columnsRef}
            className="hour-lines relative flex flex-1 border-l border-border"
            style={{ ["--hour-height" as string]: `${hourHeight}px`, backgroundPositionY: `${((60 - (gridStart % 60)) % 60) * pxPerMin}px` }}
          >
            {days.map((d, i) => (
              <div key={d} className={cn("relative flex-1", i > 0 && "border-l border-border/60", i === nowCol && days.length > 1 && "bg-primary/[0.03]")} role="list" aria-label={`Schedule for ${d}`}>
                {placed
                  .filter((p) => p.col === i)
                  .map((p) => {
                    const isDragging = drag?.key === p.item.key && drag.moved;
                    const top = (p.top - gridStart + (isDragging ? drag!.deltaMin : 0)) * pxPerMin;
                    const h = Math.max(p.height * pxPerMin, 18);
                    const isMeal = p.item.type === "meal";
                    const widthPct = isMeal ? 100 : 100 / p.lanes;
                    const travelBefore = p.item.type === "commitment" ? (p.item.start - p.item.blockStart) / MINUTE : 0;
                    const travelAfter = p.item.type === "commitment" ? (p.item.blockEnd - p.item.end) / MINUTE : 0;
                    return (
                      <div
                        key={p.item.key}
                        role="listitem"
                        className={cn("absolute px-0.5", isMeal ? "z-0" : "z-10", isDragging && "z-30")}
                        style={{
                          top,
                          height: h,
                          left: `${isMeal ? 0 : p.lane * widthPct}%`,
                          width: `${widthPct}%`,
                          transform: isDragging && drag!.deltaCol ? `translateX(${drag!.deltaCol * 100 * p.lanes}%)` : undefined,
                        }}
                      >
                        {travelBefore > 0 && (
                          <div
                            aria-hidden
                            className="absolute inset-x-1 rounded-t-lg bg-[repeating-linear-gradient(135deg,var(--block-fixed)_0_4px,transparent_4px_8px)] opacity-70"
                            style={{ top: -travelBefore * pxPerMin, height: travelBefore * pxPerMin }}
                          />
                        )}
                        {travelAfter > 0 && (
                          <div
                            aria-hidden
                            className="absolute inset-x-1 rounded-b-lg bg-[repeating-linear-gradient(135deg,var(--block-fixed)_0_4px,transparent_4px_8px)] opacity-70"
                            style={{ top: h, height: travelAfter * pxPerMin }}
                          />
                        )}
                        <BlockMenu
                          item={p.item}
                          open={menuKey === p.item.key}
                          onOpenChange={(o) => setMenuKey(o ? p.item.key : null)}
                          onMove={() => setMoveTarget({ sessionId: p.item.sessionId!, title: p.item.title, start: p.item.start, end: p.item.end })}
                          onComplete={() => {
                            const t = tasks.find((x) => x.id === p.item.taskId);
                            if (t) setCompleteTarget(t);
                          }}
                          act={act}
                          openOnClick={!canDrag(p.item)}
                        >
                          <Block
                            item={isDragging ? withDragTimes(p, drag!.deltaMin, drag!.deltaCol) : p.item}
                            tz={tz}
                            heightPx={h}
                            dragging={isDragging}
                            invalid={isDragging && drag!.invalid}
                            draggable={canDrag(p.item)}
                            onPointerDown={(e) => onPointerDown(e, p)}
                            onPointerMove={(e) => onPointerMove(e, p)}
                            onPointerUp={(e) => onPointerUp(e, p)}
                            onPointerCancel={() => setDrag(null)}
                            onKeyDown={(e) => onKeyDown(e, p)}
                          />
                        </BlockMenu>
                      </div>
                    );
                  })}
                {i === nowCol && nowTop >= 0 && nowTop <= height && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: nowTop }} aria-hidden>
                    <span className="-ml-1 size-2 rounded-full bg-destructive" />
                    <span className="h-px flex-1 bg-destructive/70" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {mover.dialog}
      <MoveDialog target={moveTarget} onClose={() => setMoveTarget(null)} onMove={mover.requestMove} />
      <CompleteTaskDialog target={completeTarget} onClose={() => setCompleteTarget(null)} />
    </div>
  );
}

/** Assign items to day columns and side-by-side lanes where they overlap. */
function layout(
  items: CalendarItem[],
  days: LocalDate[],
  midnights: number[],
  gridStart: number,
  gridEnd: number,
  optimistic: MoveRequest | null,
): Placed[] {
  const out: Placed[] = [];
  for (let col = 0; col < days.length; col++) {
    const colStart = midnights[col] + gridStart * MINUTE;
    const colEnd = midnights[col] + gridEnd * MINUTE;
    const inCol = items
      .map((it) => (optimistic && it.sessionId === optimistic.sessionId ? { ...it, start: optimistic.start, end: optimistic.end, blockStart: optimistic.start, blockEnd: optimistic.end } : it))
      .filter((it) => {
        // Each item lives in the column whose visible window contains its start.
        if (it.start < colStart || it.start >= colEnd) return false;
        const prevEnd = col > 0 ? midnights[col - 1] + gridEnd * MINUTE : -Infinity;
        return !(it.start < prevEnd && col > 0);
      })
      .map((it) => ({
        item: it,
        col,
        top: (it.start - midnights[col]) / MINUTE,
        height: Math.max(10, (Math.min(it.end, colEnd) - it.start) / MINUTE),
        lane: 0,
        lanes: 1,
      }));

    const laned = inCol.filter((p) => p.item.type !== "meal").sort((a, b) => a.top - b.top || b.height - a.height);
    let cluster: Placed[] = [];
    let clusterEnd = -Infinity;
    const flush = () => {
      const laneEnds: number[] = [];
      for (const p of cluster) {
        let lane = laneEnds.findIndex((end) => end <= p.top);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(0);
        }
        laneEnds[lane] = p.top + p.height;
        p.lane = lane;
      }
      for (const p of cluster) p.lanes = laneEnds.length;
      cluster = [];
    };
    for (const p of laned) {
      if (p.top >= clusterEnd) {
        flush();
        clusterEnd = -Infinity;
      }
      cluster.push(p);
      clusterEnd = Math.max(clusterEnd, p.top + p.height);
    }
    flush();
    out.push(...inCol);
  }
  return out;
}

function Block({
  item,
  tz,
  heightPx,
  dragging,
  invalid,
  draggable,
  ...handlers
}: {
  item: CalendarItem;
  tz: string;
  heightPx: number;
  dragging: boolean;
  invalid: boolean;
  draggable: boolean;
} & React.HTMLAttributes<HTMLButtonElement>) {
  const short = heightPx < 40;
  const tiny = heightPx < 26;
  const base =
    "group relative flex h-full w-full flex-col overflow-hidden rounded-lg px-2 text-left text-xs transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const time = fmtRange(item.start, item.end, tz);

  if (item.type === "meal") {
    return (
      <div className={cn(base, "pointer-events-none items-start justify-start bg-block-meal/60 py-1 text-block-meal-fg")} aria-label={`${item.title}, ${time}`}>
        <span className="flex items-center gap-1 font-medium opacity-80">
          <Utensils className="size-3" aria-hidden /> {item.title}
        </span>
      </div>
    );
  }
  if (item.type === "break") {
    return (
      <div className={cn(base, "justify-center bg-block-break/80 text-block-break-fg")} aria-label={`Break, ${time}`}>
        <span className="flex items-center gap-1 text-[11px] font-medium">
          <Coffee className="size-3" aria-hidden /> {tiny ? "" : "Break"}
        </span>
      </div>
    );
  }

  const isTask = item.type === "task";
  const done = item.status === "done" || item.taskCompleted;
  const label = isTask
    ? `${item.title}, ${time}${done ? ", done" : item.missed ? ", missed" : ""}${item.locked ? ", pinned" : ""}. ${draggable ? "Drag, or press Alt and an arrow key, to move." : ""}`
    : `${item.title}, ${time}${item.location ? `, at ${item.location}` : ""}${item.isMandatory ? "" : ", optional"}${item.conflict ? ", overlaps another commitment" : ""}`;

  return (
    <button
      type="button"
      aria-label={label}
      data-invalid={invalid || undefined}
      className={cn(
        base,
        short ? "justify-center py-0.5" : "justify-start py-1.5",
        isTask
          ? "border-l-[3px] border-primary bg-block-task text-block-task-fg hover:shadow-md"
          : "border-l-[3px] border-blue bg-block-fixed text-block-fixed-fg hover:shadow-md",
        isTask && !item.isMandatory && "",
        !isTask && !item.isMandatory && "border-dashed",
        item.conflict && "ring-2 ring-destructive/70",
        item.missed && "border-destructive bg-destructive/10 text-foreground",
        done && "opacity-60",
        draggable && "cursor-grab touch-none active:cursor-grabbing",
        dragging && (invalid ? "cursor-no-drop border-destructive bg-[color-mix(in_oklch,var(--destructive)_18%,var(--card))] text-foreground shadow-xl ring-2 ring-destructive" : "cursor-grabbing shadow-xl ring-2 ring-primary"),
      )}
      {...handlers}
    >
      <span className={cn("flex items-center gap-1 font-semibold leading-tight", done && "line-through")}>
        {item.conflict && <AlertTriangle className="size-3 shrink-0 text-destructive" aria-hidden />}
        {done && <CheckCircle2 className="size-3 shrink-0" aria-hidden />}
        {item.locked && !done && <Pin className="size-3 shrink-0 opacity-70" aria-hidden />}
        <span className="truncate">{item.title}</span>
      </span>
      {!tiny && (
        <span className="truncate text-[11px] tabular-nums opacity-75">
          {item.missed ? "Missed · " : ""}
          {short ? fmtTime(item.start, tz) : time}
        </span>
      )}
      {!short && heightPx > 60 && item.location && (
        <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] opacity-70">
          <MapPin className="size-3 shrink-0" aria-hidden /> {item.location}
        </span>
      )}
      {draggable && !short && (
        <MoveVertical className="absolute bottom-1 right-1 size-3 opacity-0 transition-opacity group-hover:opacity-50" aria-hidden />
      )}
    </button>
  );
}

function BlockMenu({
  item,
  open,
  onOpenChange,
  onMove,
  onComplete,
  act,
  openOnClick,
  children,
}: {
  item: CalendarItem;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onMove: () => void;
  onComplete: () => void;
  act: (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => void;
  openOnClick: boolean;
  children: React.ReactElement;
}) {
  const router = useRouter();
  if (item.type === "meal" || item.type === "break") return children;
  const done = item.status === "done";
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger
        asChild
        // Task blocks open their menu from pointer-up (so dragging doesn't open it).
        onPointerDown={openOnClick ? undefined : (e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (!openOnClick && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onOpenChange(true);
          }
        }}
      >
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="truncate">{item.title}</DropdownMenuLabel>
        {item.type === "task" ? (
          <>
            {!item.taskCompleted &&
              (done ? (
                <DropdownMenuItem onSelect={() => act(() => setSessionStatus(item.sessionId!, "planned"), "Marked as not done")}>
                  <Undo2 /> Mark block as not done
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => act(() => setSessionStatus(item.sessionId!, "done"), "Block done — progress saved")}>
                  <Check /> Mark block done
                </DropdownMenuItem>
              ))}
            {!item.taskCompleted && (
              <DropdownMenuItem onSelect={onComplete}>
                <CheckCircle2 /> Complete whole task…
              </DropdownMenuItem>
            )}
            {!done && !item.taskCompleted && (
              <DropdownMenuItem onSelect={onMove}>
                <CornerDownRight /> Move to…
              </DropdownMenuItem>
            )}
            {item.locked && !done && (
              <DropdownMenuItem onSelect={() => act(() => unlockSession(item.sessionId!), "Unpinned — planning can move it again")}>
                <PinOff /> Let the planner move it
              </DropdownMenuItem>
            )}
            {!done && (
              <DropdownMenuItem onSelect={() => act(() => setSessionStatus(item.sessionId!, "skipped"), "Skipped — the task will be rescheduled next time you plan")}>
                <SkipForward /> Skip this block
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => router.push(`/tasks?edit=${item.taskId}`)}>
              <Pencil /> Edit task
            </DropdownMenuItem>
            {!done && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => act(() => removeSession(item.sessionId!), "Block removed — the task is still on your list")}>
                  <Trash2 /> Remove block
                </DropdownMenuItem>
              </>
            )}
          </>
        ) : (
          <>
            <div className="px-2.5 pb-1.5 text-xs text-muted-foreground">
              {COMMITMENT_KIND_LABEL[item.kind ?? "other"] ?? "Commitment"} · {item.isMandatory ? "Mandatory" : "Optional"}
              {item.conflict && <span className="mt-1 block text-destructive">Overlaps another commitment</span>}
            </div>
            <DropdownMenuItem onSelect={() => router.push(`/commitments?edit=${item.commitmentId}`)}>
              <Pencil /> Edit commitment
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => act(() => setOccurrenceSkipped(item.commitmentId!, item.occurrenceDate!, true), "Cancelled for this date only")}
            >
              <SkipForward /> Cancel just this one
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
