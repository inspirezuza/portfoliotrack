export const languages = ["EN", "TH"] as const;
export const themes = ["light", "dark"] as const;

export type UiLanguage = (typeof languages)[number];
export type UiTheme = (typeof themes)[number];

export const DEFAULT_LANGUAGE: UiLanguage = "TH";
export const DEFAULT_THEME: UiTheme = "light";
export const LANGUAGE_STORAGE_KEY = "portfoliotrack.language";
export const LANGUAGE_COOKIE_KEY = "portfoliotrack.language";
export const THEME_STORAGE_KEY = "portfoliotrack.theme";

export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === "EN" || value === "TH";
}

export function parseUiLanguage(value: unknown): UiLanguage {
  return isUiLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function getHtmlLanguage(language: UiLanguage) {
  return language === "TH" ? "th" : "en";
}

export function getUiLocale(language: UiLanguage) {
  return language === "TH" ? "th-TH" : "en-GB";
}
