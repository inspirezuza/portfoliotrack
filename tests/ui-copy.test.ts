import assert from "node:assert/strict";
import test from "node:test";
import { getUiCopy } from "@/lib/ui/copy";
import { englishUiCopy, thaiUiCopy } from "@/lib/ui/copy/languages";

test("ui copy returns the focused language modules through the public accessor", () => {
  assert.strictEqual(getUiCopy("EN"), englishUiCopy);
  assert.strictEqual(getUiCopy("TH"), thaiUiCopy);
});
