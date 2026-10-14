"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "seeds-local-number";

/** A finite number persisted in localStorage, SSR-safe (server snapshot = default) and clamped to [min, max]. */
export function useLocalNumber(key: string, defaultValue: number, min = -Infinity, max = Infinity) {
  const read = useCallback(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : defaultValue;
    } catch {
      return defaultValue;
    }
  }, [key, defaultValue, min, max]);

  const value = useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    read,
    () => defaultValue,
  );

  const set = useCallback(
    (next: number) => {
      if (!Number.isFinite(next)) return;
      try {
        localStorage.setItem(key, String(Math.max(min, Math.min(max, next))));
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [key, min, max],
  );

  return [value, set] as const;
}
