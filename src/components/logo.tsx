import { cn } from "@/lib/utils";

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="10" className="fill-primary" />
        <path d="M9 21.5c3-1 5-3.6 7-7.5 1.6 3.4 3.8 6 7 7.5" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="16" cy="9.5" r="2.2" fill="white" opacity="0.9" />
      </svg>
      {withText && <span className="font-display text-xl font-semibold tracking-tight">Daywise</span>}
    </span>
  );
}
