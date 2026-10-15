"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { startOfToday } from "date-fns";

/** Observe an element's content-box size. Use the returned callback as a `ref`. */
export function useElementSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Midnight today, fixed for the lifetime of the component. */
let todayCache = startOfToday();

function subscribeToday(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    timer = setTimeout(() => {
      todayCache = startOfToday();
      onChange();
      schedule();
    }, nextMidnight.getTime() - now.getTime());
  };
  schedule();
  return () => clearTimeout(timer);
}

/** Start of today; updates when the clock passes midnight. */
export function useToday() {
  return useSyncExternalStore(
    subscribeToday,
    () => {
      const fresh = startOfToday();
      if (fresh.getTime() !== todayCache.getTime()) todayCache = fresh;
      return todayCache;
    },
    () => todayCache,
  );
}

/** True when the viewport matches a media query (false during SSR). */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
