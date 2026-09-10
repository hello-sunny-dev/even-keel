import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveFrom } from "@/lib/parse/pdf";

const CWD = pathToFileURL(join(process.cwd(), "package.json")).href;

/**
 * `npm run dump` runs under tsx, which can hand a module to Node as a `data:`
 * URL carrying its transpiled source. Nothing can be resolved relative to one:
 * a bare `import("pdfjs-dist/...")` fails with "Failed to resolve module
 * specifier", and `createRequire` with "base scheme is not hierarchical".
 *
 * It fails only on a machine whose tsx does that, and only on a PDF real
 * enough to need the font data — which is to say, never in CI and always on
 * the one statement somebody actually wanted to read.
 */
describe("resolving pdfjs without a usable module URL", () => {
  const DATA_URL = "data:text/javascript;base64,Y29uc3QgeCA9IDE7";

  it("falls back to the working directory when the base is a data: URL", () => {
    expect(resolveFrom("pdfjs-dist/package.json", [DATA_URL])).toBeNull();
    expect(resolveFrom("pdfjs-dist/package.json", [DATA_URL, CWD])).toContain("pdfjs-dist");
  });

  it("resolves the entry point the extractor imports", () => {
    const entry = resolveFrom("pdfjs-dist/legacy/build/pdf.mjs", [DATA_URL, CWD]);
    expect(entry).toMatch(/pdf\.mjs$/);
  });

  it("returns null rather than throwing when nothing resolves", () => {
    expect(resolveFrom("a-package-that-does-not-exist", [DATA_URL, CWD])).toBeNull();
  });

  it("still prefers this module's own URL when it is usable", () => {
    expect(resolveFrom("pdfjs-dist/package.json")).toContain("pdfjs-dist");
  });
});
