import type { UiLanguage } from "@/lib/ui/translations";
import { englishUiCopy } from "@/lib/ui/copy/english";
import { thaiUiCopy } from "@/lib/ui/copy/thai";

export { englishUiCopy, thaiUiCopy };

export const uiCopy = {
  TH: thaiUiCopy,
  EN: englishUiCopy,
} satisfies Record<UiLanguage, unknown>;
