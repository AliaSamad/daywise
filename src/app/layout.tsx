import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["SOFT", "opsz"] });

export const metadata: Metadata = {
  title: { default: "Daywise", template: "%s · Daywise" },
  description: "Plan for real life, not your ideal life. A realistic daily planner for students and busy adults.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8f1" },
    { media: "(prefers-color-scheme: dark)", color: "#1f1c27" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh font-sans">
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors closeButton toastOptions={{ className: "rounded-2xl" }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
