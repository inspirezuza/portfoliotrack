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
import {
  DEFAULT_THEME,
  getHtmlLanguage,
  isUiLanguage,
  LANGUAGE_COOKIE_KEY,
  LANGUAGE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type UiLanguage,
  type UiTheme
} from "@/lib/ui/translations";

type UiPreferencesContextValue = {
  language: UiLanguage;
  theme: UiTheme;
  setLanguage: (language: UiLanguage) => void;
  setTheme: (theme: UiTheme) => void;
};

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(null);

function readStoredTheme(): UiTheme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : DEFAULT_THEME;
}

function applyLanguagePreference(language: UiLanguage) {
  document.documentElement.dataset.language = getHtmlLanguage(language);
  document.documentElement.lang = getHtmlLanguage(language);
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.cookie = `${LANGUAGE_COOKIE_KEY}=${language}; path=/; max-age=31536000; SameSite=Lax`;
}

function applyThemePreference(theme: UiTheme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function UiPreferencesProvider({
  children,
  initialLanguage
}: {
  children: ReactNode;
  initialLanguage: UiLanguage;
}) {
  const [language, setLanguageState] = useState<UiLanguage>(initialLanguage);
  const [theme, setThemeState] = useState<UiTheme>(DEFAULT_THEME);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const storedTheme = readStoredTheme();

    setLanguageState(isUiLanguage(initialLanguage) ? initialLanguage : "TH");
    setThemeState(storedTheme);
    applyLanguagePreference(isUiLanguage(initialLanguage) ? initialLanguage : "TH");
    applyThemePreference(storedTheme);
    setHasHydrated(true);
  }, [initialLanguage]);

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
