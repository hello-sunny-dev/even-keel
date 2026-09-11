import { defineConfig, devices } from "@playwright/test";

/**
 * One worker, one database.
 *
 * Every spec here drives the same household against a single PGlite directory,
 * which is one connection and one set of rows. Running them in parallel would
 * have one test tagging a transaction another test was asserting was untagged,
 * and the failure would look like a bug in the app.
 */
const PORT = Number(process.env.E2E_PORT ?? 3210);
export const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Normally Playwright's own browser, downloaded by `playwright install`.
 *
 * Set `PLAYWRIGHT_CHROMIUM_PATH` where one is already on the machine and
 * downloading another is not on — a sandbox with no network, or a container
 * that ships a build whose revision does not match this version's.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

// A container commonly runs as root, where Chromium's sandbox refuses to start.
const args = process.env.PLAYWRIGHT_NO_SANDBOX ? ["--no-sandbox"] : [];
const launchOptions = { executablePath, args };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // Creating the account is itself a journey, and everything after it needs
    // to be signed in, so it runs first and hands over its cookies.
    { name: "setup", testMatch: /account\.setup\.ts/, use: { launchOptions } },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: /(account\.setup|04-mobile\.spec|09-password\.spec)\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/state.json",
        launchOptions,
      },
    },
    // Pixel 5 rather than an iPhone: its emulation runs on Chromium, and one
    // browser is one download. The width is what is being tested, and 393px is
    // within a few pixels of the phone this is actually read on.
    {
      name: "phone",
      dependencies: ["setup"],
      testMatch: /04-mobile\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        storageState: "e2e/.auth/state.json",
        launchOptions,
      },
    },
    // Last, and in its own project so it is: changing the password ends the
    // session every other project is signed in with, so anything scheduled
    // after it would quietly run against the login page and pass.
    {
      name: "session",
      dependencies: ["chromium", "phone"],
      testMatch: /09-password\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/state.json",
        launchOptions,
      },
    },
  ],

  webServer: {
    // A production build, because that is what the CSP, the security headers
    // and the standalone output actually ship as — a dev server would pass
    // tests the deployed app could fail.
    command: "node scripts/e2e-reset.mjs && npm run build && npm start",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PORT: String(PORT),
      NODE_ENV: "production",
      // A disposable database, deleted by scripts/e2e-reset.mjs before the
      // server that opens it starts.
      PGLITE_DIR: ".pglite-e2e",
      DATABASE_URL: "",
      SESSION_SECRET: "e2e-session-secret-not-a-real-one-0000000000",
    },
  },
});
