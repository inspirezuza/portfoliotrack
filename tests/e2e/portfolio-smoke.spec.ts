import { expect, test } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";

test.describe("PortfolioTrack smoke coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/_next/image**", (route) => route.abort());
  });

  test("opens the dashboard with portfolio navigation", async ({ page }) => {
    await page.goto(baseUrl);

    await expect(page.getByRole("link", { name: /portfolio/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /trade|transactions|ซื้อขาย/i })).toBeVisible();
    await expect(page.getByText(/PortfolioTrack/i)).toBeVisible();
  });

  test("opens transactions and drills into an asset detail page", async ({ page }) => {
    await page.goto(`${baseUrl}/transactions`);

    const instrumentLinks = page.locator("a.instrument-cell-link");
    await expect(instrumentLinks.first()).toBeVisible();

    const firstInstrument = instrumentLinks.first();
    const href = await firstInstrument.getAttribute("href");
    const symbol = (await firstInstrument.locator("strong").innerText()).trim();

    expect(href).toMatch(/^\/assets\/[^/]+$/);

    await firstInstrument.click();
    await page.waitForURL(/\/assets\/[^/]+$/);

    await expect(page.getByText(symbol, { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Asset detail", { exact: true })).toBeVisible();
  });

  test("keeps the admin login route reachable", async ({ page }) => {
    await page.goto(`${baseUrl}/login`);

    await expect(page.getByRole("textbox", { name: /username/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|login|เข้าสู่ระบบ/i })).toBeVisible();
  });
});
