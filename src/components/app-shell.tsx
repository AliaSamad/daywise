"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CalendarRange, ChartNoAxesColumn, ListTodo, LogOut, Plus, Settings, Sun, UserRound, Repeat } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApp } from "@/components/app-context";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/week", label: "Week", icon: CalendarRange },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/commitments", label: "Commitments", icon: Repeat },
  { href: "/insights", label: "Insights", icon: ChartNoAxesColumn },
];

export function AppShell({ children, demoActive }: { children: React.ReactNode; demoActive: boolean }) {
  const pathname = usePathname();
  const { displayName, quickAddOpen, setQuickAddOpen } = useApp();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-card focus:px-4 focus:py-2 focus:shadow-lg">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border/70 bg-card/50 px-4 py-5 backdrop-blur lg:flex">
        <Link href="/today" className="mb-6 rounded-xl px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>
        <Button onClick={() => setQuickAddOpen(true)} className="mb-5 w-full justify-start" size="lg">
          <Plus /> Add tasks
        </Button>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive(href) ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          {demoActive && (
            <Link href="/settings#demo" className="mb-2 rounded-xl bg-warning/15 px-3 py-2 text-xs text-warning-strong">
              Sample data is loaded. Manage it in Settings.
            </Link>
          )}
          <Link
            href="/settings"
            aria-current={isActive("/settings") ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive("/settings") ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Settings className="size-[18px]" aria-hidden /> Settings
          </Link>
          <form action={signOut}>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <LogOut className="size-[18px]" aria-hidden /> Log out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/today" aria-label="Daywise home">
            <Logo />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Account menu">
                <UserRound />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/commitments">
                  <Repeat /> Commitments
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          {demoActive && (
            <p className="mb-4 rounded-2xl bg-warning/15 px-4 py-2 text-xs text-warning-strong lg:hidden">
              You&apos;re viewing sample data. <Link href="/settings#demo" className="underline">Manage it</Link>
            </p>
          )}
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2">
          {[NAV[0], NAV[1]].map(({ href, label, icon: Icon }) => (
            <MobileLink key={href} href={href} label={label} icon={Icon} active={isActive(href)} />
          ))}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              aria-label="Add tasks"
              className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Plus className="size-6" />
            </button>
          </div>
          {[NAV[2], NAV[4]].map(({ href, label, icon: Icon }) => (
            <MobileLink key={href} href={href} label={label} icon={Icon} active={isActive(href)} />
          ))}
        </div>
      </nav>

      <TaskDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
}

function MobileLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof CalendarDays; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  );
}
