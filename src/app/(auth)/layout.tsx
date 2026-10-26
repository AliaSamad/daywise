import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-24 size-[28rem] rounded-full bg-sage/20 blur-3xl" />
      <Link href="/" className="relative mb-8 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Logo />
      </Link>
      <div className="relative w-full max-w-sm animate-rise">{children}</div>
    </main>
  );
}
