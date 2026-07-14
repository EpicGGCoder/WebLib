"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

const MIGRATION_KEY = "weblib-theme-default-dark-v1";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  // One-time migration: older sessions stored "light" as their theme.
  // Force the new default (dark) once so existing users see dark on next load;
  // after that, their explicit toggles are respected again.
  React.useEffect(() => {
    try {
      if (!localStorage.getItem(MIGRATION_KEY)) {
        localStorage.setItem("theme", "dark");
        localStorage.setItem(MIGRATION_KEY, "1");
      }
    } catch {
      /* ignore */
    }
  }, []);

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
