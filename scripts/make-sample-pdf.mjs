/**
 * Generates the two committed statement fixtures. Both hold the same invented
 * merchants, dates and amounts, and neither contains a real account
 * identifier, so both are safe to commit.
 *
 *   sample-statement.pdf      one text run per field — the easy case
 *   fragmented-statement.pdf  the same statement with every field broken into
 *                             several runs, which is what real bank PDFs do
 *
 * The second one exists because reassembling glyph runs into lines is the
 * parser's weak point, not its regexes. A real statement routinely emits
 * "184.55" as three runs with hairline gaps; join them wrongly and the amount
 * stops matching, so the row is dropped in silence. Parsing both fixtures to
 * identical results is what proves the gap threshold is right.
 *
 * Run: npm run fixture:sample
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../test-fixtures/sample");

const OPENING_BALANCE = 5000.0;

// [date, description, signed amount, optional wrapped second line]
const ROWS = [
  ["03/03/2025", "EMPLOYER PTY LTD SALARY", 6200.0],
  ["04/03/2025", "DIRECT DEBIT MORTGAGE HOME LOAN 12345678", -2150.0],
  ["05/03/2025", "WOOLWORTHS 1234 PERTH WA", -184.55],
  ["06/03/2025", "SYNERGY ELECTRICITY ACCOUNT", -412.8],
  ["08/03/2025", "NETFLIX.COM", -25.99],
  ["09/03/2025", "APPLE.COM/BILL SYDNEY", -12.99],
  ["11/03/2025", "METCASH TRADING LTD", -96.4],
  ["12/03/2025", "TICKETEK PTY LTD", -318.0, "ENTERTAINMENT PURCHASE"],
  ["14/03/2025", "COWAY WATER PURIFIER INSTALL + RENTAL", -289.0],
  ["17/03/2025", "BUNNINGS WAREHOUSE", -142.3],
  ["19/03/2025", "ZEPHYR TRADING CO", -68.0],
  ["21/03/2025", "UBER EATS", -47.2],
  ["24/03/2025", "BP CONNECT", -96.15],
  ["26/03/2025", "MEDIBANK PRIVATE", -389.45],
  ["28/03/2025", "ATM WITHDRAWAL CARD 4321", -200.0],
  ["31/03/2025", "ATO TAX REFUND", 1250.0],
  ["03/04/2025", "EMPLOYER PTY LTD SALARY", 6200.0],
  ["04/04/2025", "DIRECT DEBIT MORTGAGE HOME LOAN 12345678", -2150.0],
  ["07/04/2025", "COLES SUPERMARKETS", -211.75],
  ["08/04/2025", "NETFLIX.COM", -25.99],
  ["09/04/2025", "APPLE.COM/BILL SYDNEY", -4.49],
  ["12/04/2025", "COWAY WATER PURIFIER RENTAL", -49.0],
  ["15/04/2025", "ANYTIME FITNESS", -62.0],
  ["18/04/2025", "MEDIBANK PRIVATE", -389.45],
  ["22/04/2025", "BP CONNECT", -88.4],
  ["25/04/2025", "UBER EATS", -63.85],
  ["29/04/2025", "WOOLWORTHS 5678 PERTH WA", -178.2],
];

const money = (n) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Amounts print unsigned with a running balance beside them, exactly as the
// real statement does. The parser has to recover the sign from the balance
// delta — that path is the whole point of this fixture.
async function build({ fragmented }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Sample Statement");
  pdf.setCreationDate(new Date("2025-05-01T00:00:00Z"));
  pdf.setModificationDate(new Date("2025-05-01T00:00:00Z"));

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const COL = { date: 40, desc: 110, amount: 400, balance: 480 };
  const SIZE = 9;
  const TOP = 780;
  const BOTTOM = 60;
  const LEAD = 14;

  let page = pdf.addPage([595, 842]);
  let y = TOP;

  const put = (text, x, opts = {}) =>
    page.drawText(text, {
      x,
      y,
      size: opts.size ?? SIZE,
      font: opts.bold ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });

  const right = (text, x, opts = {}) => {
    const f = opts.bold ? bold : font;
    const size = opts.size ?? SIZE;
    page.drawText(text, {
      x: x - f.widthOfTextAtSize(text, size),
      y,
      size,
      font: f,
      color: rgb(0.1, 0.1, 0.1),
    });
  };

  const newPageIfNeeded = () => {
    if (y > BOTTOM) return;
    page = pdf.addPage([595, 842]);
    y = TOP;
    put("Date", COL.date, { bold: true });
    put("Description", COL.desc, { bold: true });
    right("Amount", COL.amount + 60, { bold: true });
    right("Balance", COL.balance + 70, { bold: true });
    y -= LEAD * 1.5;
  };

  put("Everyday Joint Account", COL.date, { bold: true, size: 13 });
  y -= LEAD * 1.4;
  put("Statement period 01/03/2025 to 30/04/2025", COL.date);
  y -= LEAD;
  put("Account 123-456 98765432", COL.date);
  y -= LEAD * 1.8;

  put("Date", COL.date, { bold: true });
  put("Description", COL.desc, { bold: true });
  right("Amount", COL.amount + 60, { bold: true });
  right("Balance", COL.balance + 70, { bold: true });
  y -= LEAD * 1.5;

  put("Opening balance", COL.desc);
  right(money(OPENING_BALANCE), COL.balance + 70);
  y -= LEAD;

  let balance = OPENING_BALANCE;
  for (const [date, description, amount, wrapped] of ROWS) {
    balance = Math.round((balance + amount) * 100) / 100;
    put(date, COL.date);
    put(description, COL.desc);
    right(money(Math.abs(amount)), COL.amount + 60);
    right(money(balance), COL.balance + 70);
    y -= LEAD;
    if (wrapped) {
      put(wrapped, COL.desc);
      y -= LEAD;
    }
    newPageIfNeeded();
  }

  put("Closing balance", COL.desc, { bold: true });
  right(money(balance), COL.balance + 70, { bold: true });

  const out = resolve(DIR, fragmented ? "fragmented-statement.pdf" : "sample-statement.pdf");
  await mkdir(DIR, { recursive: true });
  await writeFile(out, await pdf.save());
  return { out, rows: ROWS.length, closing: balance };
}

for (const fragmented of [false, true]) {
  const { out, rows, closing } = await build({ fragmented });
  console.log(`Wrote ${out} — ${rows} transactions, closing balance ${money(closing)}`);
}
