"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UiLanguage, UiTheme } from "@/lib/ui/translations";

type UiPreferencesContextValue = {
  language: UiLanguage;
  theme: UiTheme;
  setTheme: (theme: UiTheme) => void;
};

const DEFAULT_LANGUAGE: UiLanguage = "TH";
const DEFAULT_THEME: UiTheme = "light";
const THEME_STORAGE_KEY = "portfoliotrack.theme";

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(null);

function readStoredTheme(): UiTheme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : DEFAULT_THEME;
}

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const language = DEFAULT_LANGUAGE;
  const [theme, setThemeState] = useState<UiTheme>(DEFAULT_THEME);

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.language = language.toLowerCase();
    document.documentElement.lang = language === "TH" ? "th" : "en";
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<UiPreferencesContextValue>(
    () => ({
      language,
      theme,
      setTheme: setThemeState
    }),
    [language, theme]
  );

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  const context = useContext(UiPreferencesContext);

  if (context == null) {
    throw new Error("useUiPreferences must be used within UiPreferencesProvider.");
  }

  return context;
}
