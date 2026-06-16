"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type PersistedStatus = "idle" | "queuing" | "queued" | "error";

type StoredEntry = { value: Exclude<PersistedStatus, "idle">; expiresAt: number };

const EXPIRY_MS: Record<Exclude<PersistedStatus, "idle">, number> = {
  queuing: 30_000,
  queued:  30_000,  // 30 s — long enough to switch tabs and return without losing the confirmation
  error:    5_000,
};

function readStorage(key: string): { status: PersistedStatus; remaining: number } {
  if (typeof window === "undefined") return { status: "idle", remaining: 0 };
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { status: "idle", remaining: 0 };
    const { value, expiresAt } = JSON.parse(raw) as StoredEntry;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      sessionStorage.removeItem(key);
      return { status: "idle", remaining: 0 };
    }
    // A "queuing" entry on remount means the trigger was already dispatched server-side.
    // Convert to "queued" so the button shows success feedback rather than a stale spinner.
    if (value === "queuing") {
      return { status: "queued", remaining: EXPIRY_MS.queued };
    }
    return { status: value, remaining };
  } catch {
    return { status: "idle", remaining: 0 };
  }
}

/**
 * Drop-in replacement for useState on analysis trigger button status that survives
 * Next.js tab navigation (component unmount + remount) via sessionStorage.
 *
 * On remount, restores the last saved status and re-arms the countdown timer for
 * however much time remains. A "queuing" entry is treated as "queued" on remount
 * (the server action was already dispatched, just missing the React transition callback).
 *
 * Usage:
 *   const { status, setStatus } = usePersistedStatus("journey_plan_fix");
 *   // setStatus("queuing") — save immediately on button click
 *   // setStatus("queued")  — save on success, auto-resets after 4 s
 *   // setStatus("error")   — save on failure, auto-resets after 5 s
 *   // setStatus("idle")    — clear explicitly
 */
export function usePersistedStatus(storageKey: string): {
  status: PersistedStatus;
  setStatus: (next: PersistedStatus) => void;
} {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazy initializer reads sessionStorage synchronously — avoids an "idle" flash on remount
  const [status, setStatusRaw] = useState<PersistedStatus>(
    () => readStorage(storageKey).status,
  );

  // On mount: re-arm the auto-clear timer for any restored non-idle status
  useEffect(() => {
    const { status: restored, remaining } = readStorage(storageKey);
    if (restored === "idle") return;
    setStatusRaw(restored);
    timerRef.current = setTimeout(() => {
      try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
      setStatusRaw("idle");
    }, remaining);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only on mount

  const setStatus = useCallback(
    (next: PersistedStatus) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      if (next === "idle") {
        try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
        setStatusRaw("idle");
        return;
      }

      const expiresAt = Date.now() + EXPIRY_MS[next];
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ value: next, expiresAt } as StoredEntry),
        );
      } catch { /* ignore quota errors */ }

      setStatusRaw(next);

      timerRef.current = setTimeout(() => {
        try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
        setStatusRaw("idle");
      }, EXPIRY_MS[next]);
    },
    [storageKey],
  );

  return { status, setStatus };
}
