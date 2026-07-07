"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** The active theme, initialized by the inline script in layout.tsx.
 * Toggling persists the override; the device preference stays the default
 * until the user explicitly switches. */
export function useTheme(): [Theme, () => void] {
  // "dark" for the deterministic server render; corrected after mount.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(currentTheme());
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode — the toggle still works for this visit */
    }
    setTheme(next);
  }, []);

  return [theme, toggle];
}
