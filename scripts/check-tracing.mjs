/**
 * Everything the import route needs at runtime is in the deployment.
 *
 * Nothing else can check this. A local production build keeps the whole of
 * `node_modules` next to it, so an untraced file still resolves and every test
 * passes — including the end-to-end suite, which runs exactly that build. The
 * deployment is the only place the difference shows, and it showed as "That
 * file could not be read as a PDF" on every statement, because pdfjs imports
 * its worker by a computed specifier that no tracer can follow.
 *
 * So the assertion is on the trace manifest itself: these files must be listed
 * as needed by `/api/import`, or the next deploy breaks the same way.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TRACE = join(process.cwd(), ".next/server/app/api/import/route.js.nft.json");

const REQUIRED = [
  // Imported from inside pdf.mjs when it falls back to the fake worker.
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
  "pdfjs-dist/legacy/build/pdf.mjs",
  // Read from disk to measure glyphs in the 14 base fonts.
  "pdfjs-dist/standard_fonts/FoxitSerif.pfb",
];

let files;
try {
  files = JSON.parse(readFileSync(TRACE, "utf8")).files ?? [];
} catch {
  console.error(`No trace manifest at ${TRACE}. Run \`npm run build\` first.`);
  process.exit(1);
}

const missing = REQUIRED.filter(
  (needle) => !files.some((f) => f.replaceAll("\\", "/").endsWith(needle)),
);

if (missing.length > 0) {
  console.error("These are needed at runtime but were not traced into /api/import:\n");
  for (const m of missing) console.error(`  ${m}`);
  console.error(
    "\nAdd them to `outputFileTracingIncludes` in next.config.ts. A local build " +
      "will work without this; the deployment will not.",
  );
  process.exit(1);
}

console.log(
  `Tracing OK — ${REQUIRED.length} runtime files present in /api/import (${files.length} traced).`,
);
