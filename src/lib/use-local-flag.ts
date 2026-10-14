"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "seeds-local-flag";

/** A boolean persisted in localStorage, safe for SSR (server snapshot = default). */
export function useLocalFlag(key: string, defaultValue = false) {
  const read = useCallback(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultValue : v === "1";
    } catch {
      return defaultValue;
    }
  }, [key, defaultValue]);

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
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, set] as const;
}
