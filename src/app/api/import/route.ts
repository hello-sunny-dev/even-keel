import { NextResponse } from "next/server";
import {
  chainGaps,
  markAlreadyImported,
  markDuplicatesWithin,
  proposeFrom,
  reportFor,
  toInsertable,
  type FileReport,
  type ProposedTransaction,
} from "@/lib/ingest";
import { extractPdfLines } from "@/lib/parse/pdf";
import { parseStatementText } from "@/lib/parse/statement";
import { insertTransactions, listUserRules, recordUpload, finishUpload } from "@/lib/db/queries";
import { household } from "@/lib/session";

export const runtime = "nodejs";

// Vercel caps a request body at 4.5 MB, and the failure is an opaque 413. One
// file per request keeps well inside it and gives each its own progress.
const MAX_BYTES = 4 * 1024 * 1024;

/** Parse one statement and propose rows. Nothing is written here. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 4 MB.` },
      { status: 413 },
    );
  }

  const { db, household: id } = await household();
  const rules = await listUserRules(db, id);

  // The bytes stay in memory and go out of scope with this request. They are
  // never written to disk or to the database.
  const bytes = new Uint8Array(await file.arrayBuffer());

  let lines: string[];
  try {
    lines = await extractPdfLines(bytes);
  } catch (error) {
    const message = (error as Error).message || "";
    const friendly = /password/i.test(message)
      ? "That PDF is password-protected. Save an unprotected copy and try again."
      : "That file could not be read as a PDF.";
    return NextResponse.json({ error: friendly }, { status: 422 });
  }

  const parsed = parseStatementText(lines.join("\n"));
  const report = reportFor(parsed, file.name);
  const proposed = markDuplicatesWithin(proposeFrom(parsed, file.name, rules));

  const existing = await db.query<{ source_fingerprint: string }>(
    `select source_fingerprint from transactions
      where household_id = $1 and deleted_at is null and source_fingerprint = any($2::text[])`,
    [id, proposed.map((p) => p.sourceFingerprint)],
  );

  return NextResponse.json({
    report,
    rows: markAlreadyImported(proposed, new Set(existing.map((e) => e.source_fingerprint))),
  });
}

/** Commit a reviewed batch. One transaction, one upload id, one undo. */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    rows?: ProposedTransaction[];
    reports?: FileReport[];
  } | null;

  if (!body?.rows?.length) {
    return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
  }

  const { db, household: id } = await household();
  const rows = toInsertable(body.rows, "pdf");

  // The client's counts are a display; the server decides what actually lands.
  const uploadId = await recordUpload(db, id, {
    kind: "pdf",
    files: body.reports?.length ?? 1,
    parsed: body.rows.length,
    skipped: body.rows.length - rows.length,
  });

  const inserted = await insertTransactions(db, id, rows, uploadId);
  await finishUpload(db, uploadId, inserted);

  return NextResponse.json({
    inserted,
    skipped: body.rows.length - inserted,
    uploadId,
    gaps: chainGaps(body.reports ?? []),
  });
}
