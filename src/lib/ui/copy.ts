import type { UiLanguage } from "@/lib/ui/translations";
import { uiCopy } from "@/lib/ui/copy/languages";

export type UiCopy = (typeof uiCopy)[UiLanguage];

export function getUiCopy(language: UiLanguage): UiCopy {
  return uiCopy[language];
}
