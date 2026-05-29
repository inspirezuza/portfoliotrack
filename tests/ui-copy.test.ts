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

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (typeof value !== "object" || value == null) {
    return [];
  }

  return Object.values(value).flatMap(collectStrings);
}

test("Thai core UI copy stays readable UTF-8 Thai text", () => {
  assert.equal(thaiCoreUiCopy.shared.all, "ทั้งหมด");
  assert.equal(thaiCoreUiCopy.shared.add, "เพิ่ม");
  assert.equal(thaiCoreUiCopy.shared.search, "ค้นหา");
  assert.equal(thaiCoreUiCopy.shell.mainNavigation, "เมนูหลัก");
  assert.equal(thaiCoreUiCopy.shell.nav.dashboard, "ภาพรวม");

  const thaiCoreStrings = collectStrings(thaiCoreUiCopy);
  const mojibakeSignature = new RegExp("\\u0e40\\u0e18");

  assert.ok(thaiCoreStrings.length > 0);
  assert.deepEqual(
    thaiCoreStrings.filter(
      (value) => /[\u0080-\u009f]|\uFFFD/.test(value) || mojibakeSignature.test(value),
    ),
    [],
  );
});
