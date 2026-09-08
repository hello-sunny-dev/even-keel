import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { extractPdfLines } from "@/lib/parse/pdf";
import { parseStatementText } from "@/lib/parse/statement";

it("smoke", async () => {
  const p = fileURLToPath(new URL("../test-fixtures/sample/sample-statement.pdf", import.meta.url));
  const lines = await extractPdfLines(new Uint8Array(await readFile(p)));
  console.log(lines.join("\n"));
  const r = parseStatementText(lines.join("\n"));
  console.log(JSON.stringify(r, null, 1));
  expect(r.transactions.length).toBeGreaterThan(0);
});
