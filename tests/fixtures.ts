import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extractPdfLines } from "@/lib/parse/pdf";
import { parseStatementText, type ParseResult } from "@/lib/parse/statement";

export const SAMPLE = "sample-statement.pdf";
export const FRAGMENTED = "fragmented-statement.pdf";

export async function parseFixture(name: string): Promise<ParseResult> {
  const path = fileURLToPath(new URL(`../test-fixtures/sample/${name}`, import.meta.url));
  const lines = await extractPdfLines(new Uint8Array(await readFile(path)));
  return parseStatementText(lines.join("\n"));
}

/** Opening balance plus every movement must land on the closing balance. */
export function reconciles(result: ParseResult): number | null {
  if (result.openingBalance === null || result.closingBalance === null) return null;
  const moved = result.transactions.reduce((sum, t) => sum + Math.round(t.amount * 100), 0);
  return (
    (Math.round(result.openingBalance * 100) + moved - Math.round(result.closingBalance * 100)) /
    100
  );
}
