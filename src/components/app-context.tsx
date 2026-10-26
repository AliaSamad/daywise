"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { SchedulingPrefs } from "@/lib/scheduler/types";
import type { CategoryAccuracy } from "@/lib/reality";

interface AppContextValue {
  tz: string;
  prefs: SchedulingPrefs;
  accuracy: CategoryAccuracy[];
  displayName: string;
  quickAddOpen: boolean;
  setQuickAddOpen: (open: boolean) => void;
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  ...value
}: Omit<AppContextValue, "quickAddOpen" | "setQuickAddOpen"> & { children: React.ReactNode }) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const ctx = useMemo(
    () => ({ ...value, quickAddOpen, setQuickAddOpen }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value.tz, value.prefs, value.accuracy, value.displayName, quickAddOpen],
  );
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}
