import assert from "node:assert/strict";
import test from "node:test";
import { getUiCopy } from "@/lib/ui/copy";
import { englishCoreUiCopy, thaiCoreUiCopy } from "@/lib/ui/copy/core";
import { englishUiCopy, thaiUiCopy } from "@/lib/ui/copy/languages";

test("ui copy returns the focused language modules through the public accessor", () => {
  assert.strictEqual(getUiCopy("EN"), englishUiCopy);
  assert.strictEqual(getUiCopy("TH"), thaiUiCopy);
});

test("ui copy composes shared shell copy from focused core modules", () => {
  assert.strictEqual(englishUiCopy.shared, englishCoreUiCopy.shared);
  assert.strictEqual(englishUiCopy.shell, englishCoreUiCopy.shell);
  assert.strictEqual(thaiUiCopy.shared, thaiCoreUiCopy.shared);
  assert.strictEqual(thaiUiCopy.shell, thaiCoreUiCopy.shell);
});
