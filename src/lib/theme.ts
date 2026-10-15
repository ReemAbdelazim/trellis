"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const THEME_KEY = "trellis-theme";
const THEME_EVENT = "trellis-theme-change";

/** Inline script for <head>: applies the saved theme before first paint. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function applyTheme(theme: Theme) {
  try {
    if (theme === "system") {
      localStorage.removeItem(THEME_KEY);
      delete document.documentElement.dataset.theme;
    } else {
      localStorage.setItem(THEME_KEY, theme);
      document.documentElement.dataset.theme = theme;
    }
  } catch {}
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "system");
}
