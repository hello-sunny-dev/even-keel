/**
 * Delete the end-to-end database and the cookies from the last run.
 *
 * This is the first link of the `webServer` command rather than Playwright's
 * `globalSetup`, because global setup runs *after* the web server has started.
 * Deleting the directory out from under a live PGlite instance leaves it
 * reading files that are no longer there — "could not open file base/5/16394",
 * from a server that had already migrated and was waiting for a request.
 */
import { rmSync } from "node:fs";

for (const path of [".pglite-e2e", "e2e/.auth"]) {
  rmSync(path, { recursive: true, force: true });
}
console.log("e2e: database and saved session cleared");
