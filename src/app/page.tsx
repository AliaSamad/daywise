import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarCheck2, Gauge, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: CalendarCheck2,
    title: "Built around your real week",
    text: "Lectures, shifts, meals, travel and sleep go in first. Tasks fill what's genuinely left.",
  },
  {
    icon: Gauge,
    title: "Honest about what fits",
    text: "If ten hours of work won't fit into four free hours, Daywise says so — and helps you choose.",
  },
  {
    icon: Sparkles,
    title: "Learns how long things take",
    text: "Tell it how long tasks really took. Over time, estimates get closer to your reality.",
  },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/today");

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-40 top-10 size-[30rem] rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-40 top-60 size-[32rem] rounded-full bg-sage/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/3 size-[24rem] rounded-full bg-blue/15 blur-3xl" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-12 sm:pt-20">
        {deleted && (
          <p role="status" className="mb-8 inline-block rounded-2xl bg-sage/15 px-4 py-2 text-sm text-sage-strong">
            Your account and all of its data have been deleted.
          </p>
        )}
        <div className="max-w-2xl animate-rise">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            For students and busy adults
          </p>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Plan for real life,
            <br />
            <span className="text-primary">not your ideal life.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Tell Daywise what you need to do, and it works out when you can realistically do it — around your
            commitments, energy and the time things actually take.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">
                Plan my week <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">I have an account</Link>
            </Button>
          </div>
        </div>

        <ul className="mt-20 grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <li
              key={title}
              className="animate-rise rounded-3xl border border-border/70 bg-card/80 p-6 shadow-card backdrop-blur"
              style={{ animationDelay: `${120 + i * 80}ms` }}
            >
              <span className="mb-4 inline-flex size-10 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
