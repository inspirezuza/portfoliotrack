"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { UiLanguage, UiTheme } from "@/lib/ui/translations";

type UiPreferencesContextValue = {
  language: UiLanguage;
  theme: UiTheme;
  setLanguage: (language: UiLanguage) => void;
  setTheme: (theme: UiTheme) => void;
};

const DEFAULT_LANGUAGE: UiLanguage = "EN";
const DEFAULT_THEME: UiTheme = "light";
const LANGUAGE_STORAGE_KEY = "portfoliotrack.language";
const THEME_STORAGE_KEY = "portfoliotrack.theme";

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(null);

function readStoredTheme(): UiTheme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : DEFAULT_THEME;
}

function readStoredLanguage(): UiLanguage {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "TH" ? "TH" : DEFAULT_LANGUAGE;
}

function applyLanguagePreference(language: UiLanguage) {
  document.documentElement.dataset.language = language.toLowerCase();
  document.documentElement.lang = language === "TH" ? "th" : "en";
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

function applyThemePreference(theme: UiTheme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(DEFAULT_LANGUAGE);
  const [theme, setThemeState] = useState<UiTheme>(DEFAULT_THEME);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const storedLanguage = readStoredLanguage();
    const storedTheme = readStoredTheme();

    setLanguageState(storedLanguage);
    setThemeState(storedTheme);
    applyLanguagePreference(storedLanguage);
    applyThemePreference(storedTheme);
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    applyLanguagePreference(language);
  }, [hasHydrated, language]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    applyThemePreference(theme);
  }, [hasHydrated, theme]);

  const setLanguage = useCallback((nextLanguage: UiLanguage) => {
    applyLanguagePreference(nextLanguage);
    setLanguageState(nextLanguage);
  }, []);

  const setTheme = useCallback((nextTheme: UiTheme) => {
    applyThemePreference(nextTheme);
    setThemeState(nextTheme);
  }, []);

  const value = useMemo<UiPreferencesContextValue>(
    () => ({
      language,
      theme,
      setLanguage,
      setTheme
    }),
    [language, setLanguage, setTheme, theme]
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
