/**
 * PDF text extraction. Everything here works on an in-memory buffer — the
 * uploaded bytes are never written to disk or to the database, and the caller
 * drops the buffer as soon as the structured transactions come back.
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height?: number;
  hasEOL?: boolean;
};

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

/** pdfjs needs the 14 base fonts on disk to measure glyphs it does not embed. */
function standardFontDataUrl(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve("pdfjs-dist/package.json");
    return pathToFileURL(join(dirname(pkg), "standard_fonts/")).href;
  } catch {
    return undefined;
  }
}

/**
 * A PDF has no concept of a line — it has glyph runs at coordinates. Group
 * runs that share a baseline, order them left to right, and put a space
 * wherever the horizontal gap is wide enough to be one.
 *
 * pdfjs already merges runs within a show-text sequence and synthesises
 * explicit space items, so most kerning noise never reaches here — verified
 * against `fragmented-statement.pdf`, which draws every field in pieces and
 * still arrives identical to the clean fixture. What does reach here is
 * separately positioned runs: the columns of a statement, and any field a
 * producer placed with its own text matrix.
 *
 * The threshold is a fraction of the font size rather than an absolute
 * distance, because a producer is free to render at any scale. At 9pt a word
 * space is about 2.5 units and kerning is a fraction of one; a fixed
 * threshold that suits that size silently splits words at 4pt and glues them
 * together at 20pt.
 */
const SPACE_FRACTION = 0.18;
const MIN_GAP = 0.3;

function fontSizeOf(item: TextItem): number {
  // For unrotated text the transform's horizontal scale is the font size.
  const scale = Math.abs(item.transform[0]);
  if (scale > 0.01) return scale;
  return item.height && item.height > 0.01 ? item.height : 1;
}

export function itemsToLines(items: TextItem[]): string[] {
  const rows = new Map<number, TextItem[]>();
  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5] * 2) / 2;
    const row = rows.get(y);
    if (row) row.push(item);
    else rows.set(y, [item]);
  }

  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => {
      const sorted = row.sort((a, b) => a.transform[4] - b.transform[4]);
      let line = "";
      let cursor = -Infinity;
      for (const item of sorted) {
        const x = item.transform[4];
        const gap = Math.max(MIN_GAP, SPACE_FRACTION * fontSizeOf(item));
        // Don't add a space next to one the producer already emitted.
        const spaced = line.endsWith(" ") || item.str.startsWith(" ");
        if (line && !spaced && x - cursor > gap) line += " ";
        line += item.str;
        cursor = x + item.width;
      }
      return line.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
}

export async function extractPdfLines(data: Uint8Array): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data,
    // pdfjs v5 removed `isEvalSupported`; eval is no longer used at all.
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: standardFontDataUrl(),
    verbosity: 0,
  }).promise;

  try {
    const lines: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      try {
        const content = await page.getTextContent();
        lines.push(...itemsToLines(content.items as TextItem[]));
      } finally {
        page.cleanup();
      }
    }
    return lines;
  } finally {
    await doc.destroy();
  }
}

export async function extractPdfText(data: Uint8Array): Promise<string> {
  return (await extractPdfLines(data)).join("\n");
}
