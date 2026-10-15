"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "trellis-local-storage";

/** Re-renders on changes from this tab (our event) and other tabs (`storage`). */
function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode, policies)
  }
}

function writeRaw(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** A boolean persisted in localStorage, SSR-safe (the server renders `defaultValue`). */
export function useLocalFlag(key: string, defaultValue = false) {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const raw = readRaw(key);
      return raw === null ? defaultValue : raw === "1";
    },
    () => defaultValue,
  );
  const set = useCallback((next: boolean) => writeRaw(key, next ? "1" : "0"), [key]);
  return [value, set] as const;
}

/** A finite number persisted in localStorage, clamped to [min, max]. */
export function useLocalNumber(key: string, defaultValue: number, min = -Infinity, max = Infinity) {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const raw = readRaw(key);
      const n = raw === null ? NaN : Number(raw);
      return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : defaultValue;
    },
    () => defaultValue,
  );
  const set = useCallback(
    (next: number) => {
      if (Number.isFinite(next)) writeRaw(key, String(Math.max(min, Math.min(max, next))));
    },
    [key, min, max],
  );
  return [value, set] as const;
}

/** A raw string persisted in localStorage (null when unset); `read()` gets the latest value at call time. */
export function useLocalString(key: string) {
  const value = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  const set = useCallback((next: string) => writeRaw(key, next), [key]);
  const read = useCallback(() => readRaw(key), [key]);
  return [value, set, read] as const;
}
