import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

// Resolved against the project root, which is where Playwright runs from —
// `import.meta` is not available in the CJS the runner transpiles specs to.
const STATEMENT = resolve("test-fixtures/sample/sample-statement.pdf");

/**
 * The import journey, in the order it actually goes wrong.
 *
 * The confirm table exists because a parse can be wrong, so the test edits a
 * row and excludes a row before importing — and then re-imports the same file,
 * which is the case the fingerprint exists for. A duplicate that slips through
 * is a double count nobody sees until the year-end figure is wrong.
 */
test.describe.configure({ mode: "serial" });

test("imports a statement, with one row edited and one left out", async ({ page }) => {
  await page.goto("/add");
  await page.locator('input[type="file"]').setInputFiles(STATEMENT);

  const table = page.getByRole("table");
  await expect(table).toBeVisible();

  const rows = table.locator("tbody tr");
  const parsed = await rows.count();
  expect(parsed).toBeGreaterThan(3);

  await expect(page.getByText(/balances reconcile/i)).toBeVisible();

  // Leave one out.
  await rows.first().getByRole("checkbox").first().uncheck();
  // Correct one, the way a misparsed amount would be corrected.
  await rows.nth(1).getByRole("textbox").fill("-12.34");

  const importButton = page.getByRole("button", { name: /^Import \d+ transactions$/ });
  await expect(importButton).toContainText(String(parsed - 1));
  await importButton.click();

  await expect(page.getByText(/^Imported/)).toBeVisible();
  await expect(page.getByText(new RegExp(`Imported\\s*${parsed - 1}`))).toBeVisible();
});

test("the confirm table is readable, including the rows being left out", async ({ page }) => {
  // 03-dashboard sweeps /add with an empty table. The table is the densest
  // thing in the app and the only place a row is deliberately de-emphasised,
  // so it gets its own pass with rows actually in it.
  await page.goto("/add");
  await page.locator('input[type="file"]').setInputFiles(STATEMENT);

  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  await rows.first().getByRole("checkbox").first().uncheck();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`),
    JSON.stringify(serious, null, 2),
  ).toEqual([]);
});

test("re-importing the same statement finds every row already there", async ({ page }) => {
  await page.goto("/add");
  await page.locator('input[type="file"]').setInputFiles(STATEMENT);

  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows.first()).toBeVisible();

  // The one row that was excluded last time is the only one that is new. The
  // edited row keeps the fingerprint it was parsed with, so correcting an
  // amount must not make it look like a different transaction.
  const already = page.getByText("already imported");
  const total = await rows.count();
  expect(await already.count()).toBe(total - 1);
});
