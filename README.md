# Daywise

**Plan for real life, not your ideal life.**

Daywise is a mobile-first planner for students and busy adults. You tell it what's fixed (lectures, shifts, appointments) and what you need to do; it works out when you can *realistically* do it — around sleep, meals, travel, breaks, your energy and the time things actually take — and tells you honestly when something won't fit.

This repository contains **Phase 1 (functional MVP)**, plus the parts of Phase 2 that came almost for free once the engine existed (Replan My Day, and the data collection behind Reality Mode).

---

## What's implemented

| Area | Status |
| --- | --- |
| Email/password sign-up, log in, log out, password reset, account deletion | ✅ Supabase Auth |
| 5-step onboarding (role, day shape, meals & breaks, focus habits, weekends) | ✅ editable later in Settings |
| Fixed commitments: one-off & recurring (daily / weekly / fortnightly, weekdays, end date), travel before/after, mandatory/optional, location, notes | ✅ |
| Clash detection between commitments (direct overlap vs travel-time overlap), live in the form and flagged on the calendar | ✅ |
| Cancel a single occurrence of a recurring commitment | ✅ |
| Tasks: duration, deadline, priority, category (incl. custom), splittable, min session, earliest start, preferred time of day, status | ✅ |
| Natural-language task entry → editable drafts before saving | ✅ deterministic parser (no API key needed) |
| **Deterministic scheduling engine** (Plan My Day / Plan My Week) with preview + approval | ✅ |
| Workload warnings, deadline-risk detection, explanations and alternatives | ✅ |
| Today dashboard: right now / up next, feasibility indicator, free time, workload, progress, top 3 priorities, missed blocks | ✅ |
| Today timeline + Week calendar with drag-and-drop (mouse, touch, **Alt + arrow keys**), server-validated, conflict warnings | ✅ |
| Replan My Day (running late, took longer, too tired, something came up, missed something, break) with preview | ✅ |
| Reality Mode data: "how long did it really take?" on completion; estimate suggestions after ≥ 5 tracked tasks per category | ✅ basic |
| Insights: weekly workload vs capacity, overloaded days, missed blocks, open work by category, completions, Reality Mode | ✅ |
| Sample data, stored separately (`is_demo`) and removable in one click | ✅ |
| Light / dark / system theme, responsive layout (bottom nav on mobile, sidebar on desktop) | ✅ |
| Focus session timer, push notifications, Google/Outlook sync, AI parsing, premium | ⏳ Phase 2–3 (tables for time tracking & notifications already exist) |

---

## Tech stack

- **Next.js 15** (App Router, Server Components, Server Actions) + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui**-style components (Radix primitives, `components.json` included so `npx shadcn add …` works)
- **Supabase**: Auth, Postgres, row-level security
- **date-fns** + **@date-fns/tz** for time-zone-correct date maths
- **Vitest** for unit tests; plain SQL tests for the database
- Custom calendar grid (day & week views) built for validated drag-and-drop
- Vercel-compatible (no custom server)

---

## Project structure

```
daywise/
├── supabase/
│   ├── migrations/20261026000000_init.sql   # schema, constraints, RLS, triggers, RPCs
│   └── tests/                               # SQL tests (run with npm run test:db)
├── scripts/test-db.sh
└── src/
    ├── middleware.ts                        # session refresh + auth redirects
    ├── app/
    │   ├── page.tsx                         # landing page
    │   ├── (auth)/                          # login, signup, forgot-password, reset-password
    │   ├── auth/confirm, auth/callback      # email-link handlers (token_hash and PKCE code)
    │   ├── onboarding/                      # first-run wizard
    │   ├── (app)/                           # signed-in area (shared shell)
    │   │   ├── today/  week/  tasks/  commitments/  insights/  settings/
    │   │   ├── loading.tsx  error.tsx
    │   ├── actions/                         # server actions (all validated with zod)
    │   │   ├── tasks.ts  commitments.ts  sessions.ts  planner.ts
    │   │   ├── preferences.ts  demo.ts  auth.ts
    │   │   └── schemas.ts  result.ts
    │   └── setup/                           # shown when Supabase env vars are missing
    ├── components/
    │   ├── ui/                              # shadcn-style primitives
    │   ├── calendar/                        # time grid, week view, drag/move logic
    │   ├── planner/                         # plan preview dialog, Plan/Replan buttons
    │   ├── tasks/  commitments/  dashboard/  insights/  settings/  preferences/
    │   └── app-shell.tsx  app-context.tsx
    └── lib/
        ├── scheduler/                       # ★ pure, deterministic scheduling engine
        │   ├── time.ts         # zoned instants, intervals, DST-safe date maths
        │   ├── recurrence.ts   # expand recurring commitments
        │   ├── day.ts          # per-day frame: waking hours, work window, meals
        │   ├── engine.ts       # planSchedule(): placement, breaks, warnings, suggestions
        │   ├── conflicts.ts    # commitment clashes, drag-and-drop validation
        │   └── __tests__/
        ├── planner/preview.ts               # plan windows (day/week/replan) + diff for approval
        ├── nlp/parse-tasks.ts               # natural-language → task drafts
        ├── reality.ts                       # Reality Mode accuracy maths
        ├── dashboard.ts                     # "what now / what next / will I finish?"
        ├── calendar/items.ts                # data → calendar blocks
        ├── data/                            # Supabase loaders, row types, mappers
        ├── demo/demo-data.ts                # sample week, generated relative to today
        └── supabase/                        # browser / server / middleware clients
```

---

## How scheduling works

`planSchedule()` in `src/lib/scheduler/engine.ts` is a pure function: same input, same output, no I/O. It works on real instants (epoch ms) computed in the user's IANA time zone.

1. **Build each day's frame** — waking window (wake-up → bedtime minus wind-down), preferred working hours, meal blocks. Bedtimes after midnight and overnight commitments are supported.
2. **Block out fixed time** — commitment occurrences *including travel*, meals, protected events, and every session the planner must keep (locked by the user, completed, skipped, or already started).
3. **Compute realistic capacity** per day = min(max focus minutes × weekend factor, free time × (1 − buffer %)). Rest-day weekends get zero, light weekends half.
4. **Order tasks** — overdue first, then by deadline slack weighted by priority (urgent ≈ 2 days earlier, high ≈ 1, low ≈ 1 day later), then priority.
5. **Place work** on a 15-minute grid. Splittable tasks are cut into sessions of your preferred length (never leaving a sliver shorter than the minimum session) and **spread across days**, aiming to finish the day *before* the deadline; a second pass fills any remainder. Slots are scored by preferred time of day (or your focus preference for study/work) with a mild preference for earlier.
6. **Breaks**: every focus block reserves a break on both sides, so demanding work is never back-to-back; visible break blocks are added between consecutive sessions.
7. **Diagnose** — anything that couldn't be placed gets a reason (`deadline_passed`, `not_enough_time_before_deadline`, `no_slot_long_enough`, `outside_horizon`) and a plain-English explanation; tasks finishing < 2 h before their deadline are flagged at risk; days get a load status.
8. **Suggest alternatives** — split a task, postpone lower-priority work, stretch hours on specific days, use a light/rest day, skip an *optional* commitment, or ask for an extension. Suggestions are never applied automatically.

Plans are always **previewed** and only saved when the user clicks *Apply*. `apply_plan()` (a Postgres function) atomically swaps planner-owned future blocks in the window, never touching locked, finished, skipped, or already-started sessions. An `EXCLUDE` constraint makes it impossible to store two overlapping sessions for the same user.

Missed blocks stay visible (marked *Missed*), and their work automatically flows back into the next plan. Tasks are never deleted by planning.

---

## Database

The migration creates:

| Table | Purpose |
| --- | --- |
| `profiles` | 1:1 with `auth.users`: name, student/working, IANA time zone, onboarding flag |
| `scheduling_preferences` | wake/bed, working hours, meals, breaks, focus preference, max focus, session length, weekends, buffer, wind-down |
| `recurrence_rules` | RRULE subset (daily/weekly, interval, weekdays, until) |
| `commitments` | fixed events stored as *local date + local times + time zone*, so a 09:00 lecture stays at 09:00 across DST |
| `commitment_exceptions` | cancelled single occurrences |
| `tasks` | flexible work |
| `scheduled_sessions` | task blocks and breaks (`timestamptz`), with the no-overlap exclusion constraint |
| `time_entries` | actual time spent (Reality Mode) |
| `calendar_events` | protected personal time / imported external events (Phase 3 sync) |
| `schedule_plans` | history of applied plans and their warnings |
| `notification_preferences`, `notifications` | reminder settings and queue (delivery is Phase 3) |

Security:

- **RLS on every table**: rows are readable/writable only when `user_id = auth.uid()`.
- Triggers stop a user from referencing another user's task/commitment/rule even by guessing an id.
- `handle_new_user` creates the profile + default preferences on sign-up.
- `delete_my_account()` deletes the auth user; every table cascades.
- `is_demo` keeps sample rows separate from real data.

---

## Running locally

### 1. Prerequisites

- Node.js 20+ and npm
- A Supabase project (free tier is fine) — or the Supabase CLI for a local stack

### 2. Install

```bash
npm install
```

### 3. Set up the database

**Hosted Supabase:** open *SQL Editor* in your project, paste the contents of `supabase/migrations/20261026000000_init.sql` and run it.

**Supabase CLI:**

```bash
supabase link --project-ref <your-ref>   # or: supabase start  (local Docker stack)
supabase db push
```

### 4. Configure auth

In Supabase → *Authentication* → *URL Configuration*:

- **Site URL**: `http://localhost:3000` (your production URL when deployed)
- **Redirect URLs**: add `http://localhost:3000/auth/confirm`

Email confirmation can stay on (the default) — new users get a link that lands them in onboarding. Turn it off under *Providers → Email* if you want instant sign-up while developing.

### 5. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Where to find it | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project settings → API | e.g. `https://abcd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project settings → API → `anon` key | safe to expose; RLS protects the data |
| `NEXT_PUBLIC_SITE_URL` | your app URL | used in confirmation and reset emails; defaults to `VERCEL_URL` or `http://localhost:3000` |

No service-role key is needed — account deletion runs through a `security definer` function scoped to `auth.uid()`.

If the Supabase variables are missing, the app shows a `/setup` page instead of crashing.

### 6. Run

```bash
npm run dev          # http://localhost:3000
```

Sign up, complete onboarding (tick **Start with sample data** to explore quickly), then press **Plan my day**.

### 7. Tests

```bash
npm test             # scheduler, recurrence, conflicts, DST, plan preview/replan, NL parser, Reality Mode
npm run typecheck
PGURL=postgres://postgres@localhost:5432/postgres npm run test:db   # RLS, overlap constraint, apply_plan, cascade delete
```

The unit tests run with `TZ=America/New_York` while planning in `Europe/London`, so any accidental use of the server's local time zone fails loudly. `test:db` needs only a plain PostgreSQL 15+ with `psql`; it stubs the Supabase `auth` schema.

### 8. Deploy

Push to GitHub and import into Vercel, set the three environment variables, and add `https://<your-domain>/auth/confirm` to Supabase's redirect URLs.

---

## Design notes

- **Palette**: lavender (primary), sage (success / breaks), cream (background), muted blue (fixed commitments), warm amber (meals / warnings). All colours are CSS variables with light and dark values in `src/app/globals.css`.
- **Block language**: fixed commitments are blue with a solid edge (dashed if optional) and hatched travel time; tasks are lavender; breaks sage; meals amber. Clashes get a red outline, missed blocks a red edge, pinned blocks a pin icon.
- **Accessibility**: semantic landmarks and skip link, labelled controls, visible focus rings, `aria-live` status messages, reduced-motion support, and a keyboard alternative for every drag (Alt + arrows, or *Move to…*).
- **Tone**: warnings are framed as options, not failures ("Here are some options", "No stress — the work hasn't gone anywhere").

---

## Roadmap

**Phase 2** — Focus session timer (start/pause/extend/finish) writing to `time_entries`; time-of-day accuracy patterns; richer Replan reasons (e.g. "only light tasks today").

**Phase 3** — Google & Outlook calendar sync into `calendar_events`; push/email reminders from `notifications` honouring `notification_preferences` (including the daily cap); LLM-backed natural-language parsing behind the same `ParsedTask` interface; advanced preferences; premium tier.
