import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

/**
 * The queue is stocked on purpose rather than borrowed from whatever the
 * import happened to leave untagged. A review test that skips itself when the
 * queue is empty is a test that passes for ever without running.
 */
const UNKNOWN = "MERIDIAN CLOCKWORKS";

/**
 * A merchant of its own, deliberately not one the sample statement contains —
 * the import leaves a ZEPHYR TRADING CO untagged, and borrowing that name made
 * the count off by one for a reason that had nothing to do with the feature.
 *
 * Three rows from one merchant for the retroactive tag, then one each for the
 * two tests after it. Tagging the first merchant clears all three of its rows —
 * that is the point of the first test — so the later ones need a merchant of
 * their own rather than whatever is left.
 */
const ROWS: [description: string, amount: string][] = [
  [`${UNKNOWN} 1`, "18.40"],
  [`${UNKNOWN} 2`, "22.10"],
  [`${UNKNOWN} 3`, "9.95"],
  ["QUILL AND SONS", "41.00"],
  ["ORBIT SUPPLY DEPOT", "120.00"],
];

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: "e2e/.auth/state.json" });
  // The tabs are links, not buttons — the tab is in the URL so a reload keeps it.
  await page.goto("/add?tab=one");

  for (const [description, amount] of ROWS) {
    await page.getByLabel("Amount").fill(amount);
    await page.getByLabel("What was it").fill(description);
    await page.getByLabel("Category").selectOption("");
    await page.getByRole("button", { name: /add transaction/i }).click();
    // Not getByRole("alert"): Next's own route announcer is one too.
    await expect(page.getByText("Added.")).toBeVisible();
  }
  await page.close();
});

/**
 * Tagging one row and leaving its history wrong is the difference between a
 * correction and a chore, and the chore is what stops people tagging at all.
 * So the assertion is not that the row was tagged — it is that the queue got
 * shorter by more than one.
 */
test("tagging a merchant clears its untagged history too", async ({ page }) => {
  await page.goto("/review");

  const queue = page.getByRole("listitem");
  const mine = queue.filter({ hasText: UNKNOWN });
  expect(await mine.count()).toBe(3);
  const others = (await queue.count()) - 3;

  await mine.first().getByRole("combobox").first().selectOption({ index: 1 });
  await mine.first().getByRole("button", { name: "Tag" }).click();

  // All three go, not the one that was tagged — and nothing else moves.
  await expect.poll(async () => mine.count()).toBe(0);
  expect(await queue.count()).toBe(others);
});

test("a transfer is answered without inventing a category for it", async ({ page }) => {
  await page.goto("/review");

  const queue = page.getByRole("listitem");
  const before = await queue.count();
  // Named, not `first()`: the tests after this one take a row each, and which
  // row is first depends on an ordering neither of them should care about.
  const row = queue.filter({ hasText: "QUILL AND SONS" });
  await expect(row).toHaveCount(1);

  await row.getByRole("button", { name: "Transfer" }).click();
  await expect.poll(async () => queue.count()).toBe(before - 1);
});

test("splitting a charge cannot be submitted until the parts add up", async ({ page }) => {
  await page.goto("/review");

  const queue = page.getByRole("listitem");
  expect(await queue.count()).toBeGreaterThan(0);

  const row = queue.filter({ hasText: "ORBIT SUPPLY DEPOT" });
  await expect(row).toHaveCount(1);
  const before = await queue.count();
  await row.getByRole("button", { name: "Split" }).click();

  const parts = row.locator('input[inputmode="decimal"]');
  const split = row.getByRole("button", { name: "Split it" });

  // Deliberately short. The form refuses rather than reporting a failure
  // afterwards, and says how much is still unaccounted for.
  await parts.nth(0).fill("-1");
  await parts.nth(1).fill("-1");
  await row.getByRole("combobox").nth(0).selectOption({ index: 1 });
  await row.getByRole("combobox").nth(1).selectOption({ index: 1 });
  await expect(row.getByText(/still to place/i)).toBeVisible();
  await expect(split).toBeDisabled();

  // The amounts came from the manual entries above: $120.00 out.
  await parts.nth(0).fill("-100");
  await parts.nth(1).fill("-20");
  await expect(row.getByText("adds up")).toBeVisible();
  await expect(split).toBeEnabled();

  await split.click();
  // The original stays for provenance and stops counting, so the row leaves
  // the queue and its two parts do not arrive in it tagged.
  await expect.poll(async () => queue.count()).toBe(before - 1);
});
