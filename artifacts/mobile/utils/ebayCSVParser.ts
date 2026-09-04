/**
 * Flexible eBay CSV parser — handles Transaction Reports, Payments Reports,
 * Seller Hub Order exports, and arbitrary CSV exports with unknown metadata
 * header rows above the real column row.
 *
 * Algorithm
 * ─────────
 * 1. Scan up to MAX_SCAN_ROWS rows looking for the "best" header row by
 *    scoring how many of its cells match known eBay column-name aliases.
 * 2. Build column-index map from the winning row.
 * 3. Parse every data row below it.
 * 4. If the caller supplies a ColumnMapping override (from the manual-mapping
 *    UI) those indices take precedence.
 */

// ── Public types ──────────────────────────────────────────────────────────────

export interface EbayCSVRow {
  date: string;        // ISO "YYYY-MM-DD"
  title: string;
  saleAmount: number;  // positive dollars
  ebayFee: number;     // positive dollars (stored as negative in ledger)
  orderId: string;
}

export interface ParseResult {
  rows: EbayCSVRow[];
  errors: string[];
  warnings: string[];
  skipped: number;
  totalRevenue: number;
  totalFees: number;
  /** Raw column headers exactly as parsed from the header row (for the mapping UI). */
  detectedHeaders: string[];
  /** Which column indices were actually used (for diagnostics). */
  usedColumns: {
    amount: number;
    title: number;
    date: number;
    fee: number;
    feeFixed: number;
    order: number;
  };
}

/**
 * Manual column-index overrides from the fallback mapping UI.
 * -1 means "not present / skip".
 */
export interface ColumnMapping {
  amount?: number;
  title?: number;
  date?: number;
  fee?: number;       // variable fee column
  feeFixed?: number;  // fixed fee column (optional second fee)
  order?: number;
}

// ── Alias sets (all values are normalizeKey() results) ────────────────────────

/** How many rows to scan searching for the real header. */
const MAX_SCAN_ROWS = 30;

/** Minimum score for a row to be considered the header. */
const MIN_HEADER_SCORE = 1;

const SALE_ALIASES = new Set([
  // spec-required
  'amount', 'totalamount', 'itemsubtotal', 'soldfor', 'grossprice',
  'saleprice', 'orderprice', 'netamount', 'itemprice',
  // extra eBay columns observed in the wild
  'itemsubtotal', 'grosstransactionamount', 'grossamount',
  'saleamount', 'salesamount', 'subtotal', 'itempricea',
  'amountsold', 'itemtotal', 'ordertotal', 'listedprice',
]);

const TITLE_ALIASES = new Set([
  // spec-required
  'itemtitle', 'title', 'itemdescription', 'customlabel', 'itemname',
  // extra
  'description', 'producttitle', 'listingtitle', 'item',
]);

const FEE_ALIASES = new Set([
  // spec-required
  'fee', 'ebayfees', 'finalvaluefee', 'insertionfee', 'totalfees',
  // extra eBay columns
  'fvfvariable', 'finalvaluefeevariable', 'finalvaluefeepercent',
  'sellingfee', 'transactionfee', 'totalfee', 'fees',
]);

const FEE_FIXED_ALIASES = new Set([
  'fvffixed', 'finalvaluefeefixed', 'fixedfee',
]);

const DATE_ALIASES = new Set([
  // spec-required
  'date', 'transactiondate', 'creationdate', 'paiddate',
  // extra
  'transactioncreationdate', 'saledate', 'orderdate', 'purchasedate',
  'settlementdate', 'salecreationdate', 'paymentdate', 'solddate',
]);

const ORDER_ALIASES = new Set([
  'transactionid', 'orderid', 'ordernumber', 'referenceid',
  'legacyorderid', 'ebayorderid',
]);

// ── Scoring sets — merged view of all aliases for header detection ─────────────

const ALL_KNOWN: Set<string>[] = [
  SALE_ALIASES, TITLE_ALIASES, FEE_ALIASES, FEE_FIXED_ALIASES,
  DATE_ALIASES, ORDER_ALIASES,
];

// ── Low-level helpers ─────────────────────────────────────────────────────────

/** Collapse to lowercase alphanumeric for fuzzy matching. */
export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parse a monetary string to a float.
 * Handles: "$1,234.56", "(125.00)", "−18.50", "1 234,56" (EU locale).
 */
export function parseAmount(s: string): number {
  if (!s) return 0;
  const t = s.trim();
  if (!t) return 0;

  // Detect negative: leading "-", "(…)", or Unicode minus "−"
  const isNeg =
    t.startsWith('-') ||
    t.startsWith('(') ||
    t.startsWith('\u2212');   // − U+2212

  // Strip everything that isn't a digit or decimal point.
  // We handle both "." and "," as decimal separators:
  //   "1,234.56"  → strip commas first → "1234.56"
  //   "1.234,56"  → strip periods first → "1234,56" → swap comma → "1234.56"
  let clean = t.replace(/[^0-9.,]/g, '');

  // Detect EU format: ends with ",XX" (2-digit decimal after comma)
  if (/,\d{2}$/.test(clean) && !clean.includes('.')) {
    // EU: "1234,56"
    clean = clean.replace(',', '.');
  } else {
    // US: "1,234.56" — remove grouping commas
    clean = clean.replace(/,/g, '');
  }

  const num = parseFloat(clean);
  if (isNaN(num)) return 0;
  return isNeg ? -num : num;
}

/** Parse a date string to ISO "YYYY-MM-DD". */
function parseDate(s: string): string {
  const t = s.trim();
  if (!t) return todayISO();

  // "Jul 10, 2026" or "Jul 10 2026"
  const MONTHS: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const abbr = /^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (abbr) {
    const mm = MONTHS[abbr[1].toLowerCase()];
    if (mm) return `${abbr[3]}-${mm}-${abbr[2].padStart(2, '0')}`;
  }

  // "10/15/2026" MM/DD/YYYY
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;

  // "2026-07-10" already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);

  // "15-Jul-2026" DD-Mon-YYYY
  const dmy = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(t);
  if (dmy) {
    const mm = MONTHS[dmy[2].toLowerCase()];
    if (mm) return `${dmy[3]}-${mm}-${dmy[1].padStart(2, '0')}`;
  }

  // Fallback: native Date parse
  const d = new Date(t);
  return isNaN(d.getTime()) ? todayISO() : d.toISOString().split('T')[0];
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** Parse a single CSV line, respecting quoted fields and doubled-quote escapes. */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

/** Score a header candidate row: how many of its cells match a known alias. */
function scoreHeaderRow(cells: string[]): number {
  let score = 0;
  for (const cell of cells) {
    const key = normalizeKey(cell);
    if (!key) continue;
    for (const aliasSet of ALL_KNOWN) {
      if (aliasSet.has(key)) { score++; break; }
    }
  }
  return score;
}

/** Find the first index in `headers` whose normalised form is in `aliasSet`. */
function findCol(headers: string[], aliasSet: Set<string>): number {
  return headers.findIndex(h => aliasSet.has(normalizeKey(h)));
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseEbayCSV(
  csvText: string,
  overrides?: ColumnMapping,
): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  const rows: EbayCSVRow[] = [];

  // Normalise line endings
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // ── 1. Find the best header row ──────────────────────────────────────────
  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < Math.min(lines.length, MAX_SCAN_ROWS); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = parseCSVLine(line);
    const score = scoreHeaderRow(cells);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
    // Early exit: strong match (≥3 recognised columns)
    if (score >= 3) break;
  }

  if (bestIdx === -1 || bestScore < MIN_HEADER_SCORE) {
    // Nothing even slightly resembling a header — return the raw first row
    // as detectedHeaders so the mapping UI can show something.
    const fallbackHeaders = lines.find(l => l.trim())
      ? parseCSVLine(lines.find(l => l.trim())!)
      : [];
    return {
      rows, errors: ['No recognisable header row found in this file.'],
      warnings, skipped: 0,
      totalRevenue: 0, totalFees: 0,
      detectedHeaders: fallbackHeaders,
      usedColumns: { amount: -1, title: -1, date: -1, fee: -1, feeFixed: -1, order: -1 },
    };
  }

  const rawHeaders = parseCSVLine(lines[bestIdx]);

  // Log metadata rows that were skipped (for debugging)
  if (bestIdx > 0) {
    warnings.push(
      `Skipped ${bestIdx} metadata row${bestIdx > 1 ? 's' : ''} before the column header (row ${bestIdx + 1}).`
    );
    console.log(`[eBay CSV] Header found on row ${bestIdx + 1}; skipped ${bestIdx} metadata rows.`);
  }

  // ── 2. Build column index map ────────────────────────────────────────────
  const colAmount   = overrides?.amount   ?? findCol(rawHeaders, SALE_ALIASES);
  const colTitle    = overrides?.title    ?? findCol(rawHeaders, TITLE_ALIASES);
  const colDate     = overrides?.date     ?? findCol(rawHeaders, DATE_ALIASES);
  const colFee      = overrides?.fee      ?? findCol(rawHeaders, FEE_ALIASES);
  const colFeeFixed = overrides?.feeFixed ?? findCol(rawHeaders, FEE_FIXED_ALIASES);
  const colOrder    = overrides?.order    ?? findCol(rawHeaders, ORDER_ALIASES);

  console.log('[eBay CSV] Detected headers:', rawHeaders);
  console.log('[eBay CSV] Column map →', {
    amount: colAmount >= 0 ? rawHeaders[colAmount] : 'NOT FOUND',
    title:  colTitle  >= 0 ? rawHeaders[colTitle]  : 'NOT FOUND',
    date:   colDate   >= 0 ? rawHeaders[colDate]   : 'NOT FOUND',
    fee:    colFee    >= 0 ? rawHeaders[colFee]     : 'NOT FOUND',
  });

  if (colAmount === -1) {
    errors.push(
      'Could not find a sale-amount column.\n' +
      'Expected headers like: Amount, Total Amount, Item Subtotal, Sold For, Gross Amount, Sale Price, Item Price.\n\n' +
      `Columns detected in this file:\n${rawHeaders.join(' · ')}`
    );
    return {
      rows, errors, warnings, skipped: 0,
      totalRevenue: 0, totalFees: 0,
      detectedHeaders: rawHeaders,
      usedColumns: { amount: -1, title: -1, date: -1, fee: -1, feeFixed: -1, order: -1 },
    };
  }

  // ── 3. Parse data rows ───────────────────────────────────────────────────
  for (let i = bestIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;

    const fields = parseCSVLine(raw);
    if (fields.length < 2) { skipped++; continue; }

    const saleAmount = parseAmount(colAmount >= 0 ? fields[colAmount] ?? '' : '');

    // Skip refunds, adjustments, and zero rows
    if (saleAmount <= 0) { skipped++; continue; }

    const feeVar   = colFee      >= 0 ? Math.abs(parseAmount(fields[colFee]      ?? '')) : 0;
    const feeFix   = colFeeFixed >= 0 ? Math.abs(parseAmount(fields[colFeeFixed] ?? '')) : 0;
    const ebayFee  = feeVar + feeFix;

    const date    = parseDate(colDate  >= 0 ? (fields[colDate]  ?? '') : '');
    const title   = colTitle >= 0 ? (fields[colTitle] || 'eBay Sale').trim() : 'eBay Sale';
    const orderId = colOrder >= 0 ? (fields[colOrder]  || '').trim() : '';

    rows.push({ date, title, saleAmount, ebayFee, orderId });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push(
      'No valid sale rows found.\n' +
      'Make sure the CSV contains rows with positive sale amounts.\n' +
      `(${skipped} rows were skipped as refunds or zero-amount transactions.)`
    );
  }

  const totalRevenue = rows.reduce((s, r) => s + r.saleAmount, 0);
  const totalFees    = rows.reduce((s, r) => s + r.ebayFee,    0);

  return {
    rows, errors, warnings, skipped,
    totalRevenue, totalFees,
    detectedHeaders: rawHeaders,
    usedColumns: {
      amount: colAmount, title: colTitle, date: colDate,
      fee: colFee, feeFixed: colFeeFixed, order: colOrder,
    },
  };
}
