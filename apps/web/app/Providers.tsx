"use client";

import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useHydrateStore } from "@/lib/hooks/useHydrateStore";

export default function Providers({ children }: { children: React.ReactNode }) {
  // UX-3b: Trigger Zustand localStorage rehydration after first client render.
  // Must live here (a "use client" boundary) so it never runs on the server.
  useHydrateStore();

  return (
    <SessionProvider>
      <TooltipProvider delay={0}>{children}</TooltipProvider>
    </SessionProvider>
  );
}
