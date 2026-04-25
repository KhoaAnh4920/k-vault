"use client";

import { useEffect } from "react";
import { usePlayerStore } from "@/lib/stores/usePlayerStore";

/**
 * UX-3b: Triggers Zustand localStorage rehydration after the first
 * client-side render.
 *
 * Because the store is created with `skipHydration: true`, Zustand will NOT
 * read from localStorage during SSR — which would cause a React hydration
 * mismatch when the server-rendered defaults differ from the user's saved prefs.
 *
 * Call this hook once in a client boundary that wraps the entire app (e.g.,
 * app/Providers.tsx). The `rehydrate()` call is idempotent and fires only once
 * after mount, making the transition from defaults → saved prefs invisible.
 */
export function useHydrateStore() {
  useEffect(() => {
    // rehydrate() reads from localStorage and merges persisted keys into the store.
    // It is a no-op if localStorage is unavailable (e.g., in a sandboxed iframe).
    usePlayerStore.persist.rehydrate();
  }, []);
}
