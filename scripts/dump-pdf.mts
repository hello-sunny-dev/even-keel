/**
 * Diagnose a real bank statement without storing anything.
 *
 *   npm run dump -- ~/statements/march.pdf
 *
 * Reads the file, prints the reconstructed lines and what the parser made of
 * them, and exits. It writes nothing, uploads nothing, and redacts every line
 * before printing so the output is safe to paste into a chat when working out
 * a parsing rule.
 *
 * This exists because the parser's weak point is not its regexes — it is
 * `itemsToLines`, which reassembles PDF glyph runs into lines. If a real
 * statement splits "184.55" into "184" and ".55", the amount no longer matches
 * and the row is dropped *silently*. No test in this repo can catch that
 * without a real file, so this script is how the risk gets retired.
 */
import { readFile } from "node:fs/promises";
import { extractPdfLines } from "../src/lib/parse/pdf";
import { parseStatementText } from "../src/lib/parse/statement";
import { redactDescription } from "../src/lib/redact";
import { formatAUD } from "../src/lib/money";

const path = process.argv[2];
const fallbackYear = process.argv[3] ? Number(process.argv[3]) : undefined;

if (!path) {
  console.error("Usage: npm run dump -- <statement.pdf> [fallback-year]");
  process.exit(1);
}

const rule = (label: string) => console.log(`\n${label}\n${"─".repeat(72)}`);

const bytes = new Uint8Array(await readFile(path));
console.log(`${path} — ${(bytes.byteLength / 1024).toFixed(0)} KB`);

let lines: string[];
try {
  lines = await extractPdfLines(bytes);
} catch (error) {
  console.error(`\nCould not read this PDF: ${(error as Error).message}`);
  console.error("If it is password-protected, save an unprotected copy and try again.");
  process.exit(1);
}

rule(`RECONSTRUCTED LINES (${lines.length}) — redacted, safe to share`);
lines.forEach((line, i) => console.log(String(i + 1).padStart(4) + "  " + redactDescription(line)));

const result = parseStatementText(lines.join("\n"), { fallbackYear });

rule(`PARSED (${result.transactions.length} transactions)`);
for (const t of result.transactions) {
  console.log(
    `${t.date}  ${formatAUD(t.amount, { cents: true }).padStart(12)}  ` +
      `${String(t.signSource).padEnd(8)}  ${t.description}`,
  );
}

rule("CHECKS");
const first = result.transactions[0]?.date;
const last = result.transactions[result.transactions.length - 1]?.date;
console.log(`Period          ${first ?? "—"} → ${last ?? "—"}`);
console.log(`Opening balance ${result.openingBalance ?? "not found"}`);
console.log(`Closing balance ${result.closingBalance ?? "not found"}`);

// The strongest signal available without a second statement: every parsed
// amount, applied to the opening balance, must land exactly on the closing
// balance. Any mismatch means a row was dropped or misread.
if (result.openingBalance !== null && result.closingBalance !== null) {
  const moved = result.transactions.reduce((sum, t) => sum + Math.round(t.amount * 100), 0);
  const expected = Math.round(result.openingBalance * 100) + moved;
  const actual = Math.round(result.closingBalance * 100);
  const drift = (expected - actual) / 100;
  console.log(
    drift === 0
      ? "Reconciles     ✓  every transaction accounted for"
      : `Reconciles     ✗  off by ${formatAUD(drift, { cents: true })} — rows were dropped or misread`,
  );
} else {
  console.log("Reconciles      cannot check — no opening/closing balance line found");
}

const bySign = result.transactions.reduce<Record<string, number>>((acc, t) => {
  acc[t.signSource] = (acc[t.signSource] ?? 0) + 1;
  return acc;
}, {});
console.log(`Sign resolved   ${JSON.stringify(bySign)}`);

if (result.skipped.length) {
  rule(`SKIPPED — dated lines carrying no amount (${result.skipped.length})`);
  result.skipped.forEach((line) => console.log("  " + line));
}

if (result.warnings.length) {
  rule(`WARNINGS (${result.warnings.length})`);
  result.warnings.forEach((warning) => console.log("  " + warning));
}

console.log("\nNothing was written or uploaded.\n");
