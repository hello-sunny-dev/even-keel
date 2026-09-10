/**
 * Diagnose real bank statements without storing anything.
 *
 *   npm run dump -- ~/finance                 # every PDF in a directory
 *   npm run dump -- ~/finance/march.pdf       # one file
 *   npm run dump -- ~/finance --quiet         # skip the line-by-line dump
 *
 * Reads the files, prints the reconstructed lines and what the parser made of
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
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { extractPdfLines } from "../src/lib/parse/pdf";
import { parseStatementText, type ParseResult } from "../src/lib/parse/statement";
import { redactDescription } from "../src/lib/redact";
import { formatAUD } from "../src/lib/money";

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const positional = args.filter((a) => !a.startsWith("--"));
const target = positional[0];
const fallbackYear = positional[1] ? Number(positional[1]) : undefined;

if (!target) {
  console.error("Usage: npm run dump -- <statement.pdf | directory> [fallback-year] [--quiet]");
  process.exit(1);
}

const rule = (label: string) => console.log(`\n${label}\n${"─".repeat(72)}`);

/** One file, or every PDF in a directory, oldest name first. */
async function collect(path: string): Promise<string[]> {
  const info = await stat(path).catch(() => null);
  if (!info) {
    console.error(`No such file or directory: ${path}`);
    process.exit(1);
  }
  if (!info.isDirectory()) return [path];

  const names = (await readdir(path))
    .filter((name) => extname(name).toLowerCase() === ".pdf")
    .sort();
  if (names.length === 0) {
    console.error(`No PDFs in ${path}`);
    process.exit(1);
  }
  return names.map((name) => join(path, name));
}

type Summary = {
  name: string;
  result: ParseResult | null;
  error?: string;
  drift: number | null;
};

function driftOf(result: ParseResult): number | null {
  if (result.openingBalance === null || result.closingBalance === null) return null;
  const moved = result.transactions.reduce((sum, t) => sum + Math.round(t.amount * 100), 0);
  return (
    (Math.round(result.openingBalance * 100) + moved - Math.round(result.closingBalance * 100)) /
    100
  );
}

async function diagnose(path: string): Promise<Summary> {
  const name = basename(path);
  const bytes = new Uint8Array(await readFile(path));
  console.log(`\n${"═".repeat(72)}\n${name} — ${(bytes.byteLength / 1024).toFixed(0)} KB`);

  let lines: string[];
  try {
    lines = await extractPdfLines(bytes);
  } catch (error) {
    const message = (error as Error).message;
    console.error(`\nCould not read this PDF: ${message}`);
    console.error("If it is password-protected, save an unprotected copy and try again.");
    return { name, result: null, error: message, drift: null };
  }

  if (!quiet) {
    rule(`RECONSTRUCTED LINES (${lines.length}) — redacted, safe to share`);
    lines.forEach((line, i) =>
      console.log(String(i + 1).padStart(4) + "  " + redactDescription(line)),
    );
  }

  const result = parseStatementText(lines.join("\n"), { fallbackYear });

  rule(`PARSED (${result.transactions.length} transactions)`);
  for (const t of result.transactions) {
    console.log(
      `${t.date}  ${formatAUD(t.amount, { cents: true }).padStart(12)}  ` +
        `${String(t.signSource).padEnd(8)}  ${redactDescription(t.description)}`,
    );
  }

  rule("CHECKS");
  const first = result.transactions[0]?.date;
  const last = result.transactions[result.transactions.length - 1]?.date;
  console.log(`Period          ${first ?? "—"} → ${last ?? "—"}`);
  console.log(`Opening balance ${result.openingBalance ?? "not found"}`);
  console.log(`Closing balance ${result.closingBalance ?? "not found"}`);

  // The strongest signal available from one statement: every parsed amount,
  // applied to the opening balance, must land exactly on the closing balance.
  // Any mismatch means a row was dropped or misread.
  const drift = driftOf(result);
  console.log(
    drift === null
      ? "Reconciles      cannot check — no opening/closing balance line found"
      : drift === 0
        ? "Reconciles     ✓  every transaction accounted for"
        : `Reconciles     ✗  off by ${formatAUD(drift, { cents: true })} — rows were dropped or misread`,
  );

  const bySign = result.transactions.reduce<Record<string, number>>((acc, t) => {
    acc[t.signSource] = (acc[t.signSource] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Sign resolved   ${JSON.stringify(bySign)}`);

  if (result.skipped.length) {
    rule(`SKIPPED — dated lines carrying no amount (${result.skipped.length})`);
    result.skipped.forEach((line) => console.log("  " + redactDescription(line)));
  }

  if (result.warnings.length) {
    rule(`WARNINGS (${result.warnings.length})`);
    result.warnings.forEach((warning) => console.log("  " + warning));
  }

  return { name, result, drift };
}

const paths = await collect(target);
const summaries: Summary[] = [];
for (const path of paths) {
  summaries.push(await diagnose(path));
}

if (summaries.length > 1) {
  rule(`ACROSS ALL ${summaries.length} FILES`);
  for (const s of summaries) {
    const verdict = s.error
      ? "could not read"
      : s.drift === null
        ? "no balances to check"
        : s.drift === 0
          ? "✓ reconciles"
          : `✗ off by ${formatAUD(s.drift, { cents: true })}`;
    console.log(
      `${s.name.padEnd(34)} ${String(s.result?.transactions.length ?? 0).padStart(4)} rows   ${verdict}`,
    );
  }

  // Statements laid end to end: each one's opening balance should equal the
  // previous one's closing balance. A gap means a statement is missing, an
  // overlap means one is counted twice — neither is visible from a single file.
  const chained = summaries
    .filter((s) => s.result?.openingBalance != null && s.result?.closingBalance != null)
    .sort((a, b) =>
      (a.result!.transactions[0]?.date ?? "").localeCompare(b.result!.transactions[0]?.date ?? ""),
    );
  const gaps: string[] = [];
  for (let i = 1; i < chained.length; i++) {
    const previous = chained[i - 1].result!;
    const current = chained[i].result!;
    const difference = Math.round((current.openingBalance! - previous.closingBalance!) * 100) / 100;
    if (difference !== 0) {
      gaps.push(
        `${chained[i - 1].name} closes at ${previous.closingBalance} but ${chained[i].name} ` +
          `opens at ${current.openingBalance} — a statement is missing, or these overlap`,
      );
    }
  }
  console.log(
    gaps.length === 0
      ? "\nThe statements chain end to end with no gap."
      : "\n" + gaps.map((g) => "  " + g).join("\n"),
  );
}

console.log("\nNothing was written or uploaded.\n");
