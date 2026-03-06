/**
 * PDF bank statement parser for Italian banks.
 *
 * Supported banks (auto-detected):
 *   Isybank · Intesa Sanpaolo · UniCredit · BancoBPM · Generic Italian
 *
 * Key insight: pdfjs-dist preserves PDF layout — amounts always appear on
 * the SAME x-row as their date pair (in the ADDEBITI/ACCREDITI column).
 * Description lines are on separate rows below.
 *
 * Sign detection is column-position based, not keyword based, so it works
 * universally across Italian banks.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { categorize } from './categorizer';
import type { ParseResult } from './parsers';

// ── pdfjs-dist ──────────────────────────────────────────────────────────────

let _pdfjs: any = null;
function getPdfJs() {
  if (!_pdfjs) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    // React Native has no Web Worker API — pdfjs falls back to main-thread.
    _pdfjs.GlobalWorkerOptions.workerSrc = '';
  }
  return _pdfjs;
}

// ── Internal types ───────────────────────────────────────────────────────────

type PDFBank = 'isybank' | 'intesa' | 'unicredit' | 'bpm' | 'generic';

interface PDFItem { str: string; x: number; y: number; }

interface TxRow {
  dateContabile: string;  // YYYY-MM-DD
  dateOp: string;         // YYYY-MM-DD
  typeKeyword: string;    // raw type string from the date row
  amount: number;         // absolute value (always > 0)
  sign: 1 | -1;           // +1 credit, -1 debit
  descLines: string[];    // lines accumulated AFTER this row
}

// ── Low-level extraction ─────────────────────────────────────────────────────

async function extractPDFItems(uri: string): Promise<{ pages: PDFItem[][]; widths: number[] }> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64 as any,
  });

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const lib = getPdfJs();
  const doc = await lib.getDocument({ data: bytes }).promise;

  const pages: PDFItem[][] = [];
  const widths: number[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    widths.push(vp.width);

    const tc = await page.getTextContent();
    pages.push(
      (tc.items as any[])
        .filter((it: any) => it.str && it.str.trim())
        .map((it: any) => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
        })),
    );
  }

  return { pages, widths };
}

/** Group items within a page into horizontal rows (y snapped to ±3 pt). */
function groupIntoRows(items: PDFItem[]): Map<number, PDFItem[]> {
  const map = new Map<number, PDFItem[]>();
  for (const it of items) {
    const key = Math.round(it.y / 3) * 3;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  // Sort items within each row left→right
  for (const row of map.values()) row.sort((a, b) => a.x - b.x);
  return map;
}

/** Rows sorted top→bottom (PDF y increases upward → sort descending). */
function sortedRows(rowMap: Map<number, PDFItem[]>): [number, PDFItem[]][] {
  return [...rowMap.entries()].sort(([a], [b]) => b - a);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const AMT_RE = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/;
const DATE_DOT_RE = /^(\d{2}\.\d{2}\.\d{4})$/;
const DATE_SLASH_RE = /^(\d{2}\/\d{2}\/\d{4})$/;
const DATE_SINGLE_RE = /^(\d{2}[./]\d{2}[./]\d{4})$/;

function toISO(s: string): string | null {
  const dot = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dot) return `${dot[3]}-${dot[2]}-${dot[1]}`;
  const slash = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;
  return null;
}

function parseItalianAmt(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}

function clean(s: string): string {
  return s.replace(/\s{2,}/g, ' ').replace(/''/g, "'").trim().slice(0, 60);
}

function isNoiseLine(s: string): boolean {
  if (!s.trim()) return true;
  if (/^Pagina \d+ di \d+/i.test(s)) return true;
  if (/^DATA CONTABILE/i.test(s)) return true;
  if (/^[A-Z0-9]{12,}-[A-Z0-9-]{10,}$/.test(s.trim())) return true;
  if (/^Saldo (?:iniziale|finale|del periodo)/i.test(s)) return true;
  if (/^Totale (?:accrediti|addebiti)/i.test(s)) return true;
  if (/^(?:Riepilogo|Dettaglio Movimenti|ESTRATTO CONTO|INFORMAZIONI UTILI|Coordinate|Tipologia)/i.test(s)) return true;
  if (/^(?:IBAN\s+IT|BIC\s+|Milano,\s+\d|Avvisi importanti|•\s)/i.test(s)) return true;
  if (/^\d{7}$/.test(s.trim())) return true;
  // Intesa / Unicredit noise
  if (/^(?:Saldo Iniziale|Saldo Finale|Totale Movimenti)/i.test(s)) return true;
  return false;
}

// ── Bank detection ───────────────────────────────────────────────────────────

function detectBank(fullText: string): PDFBank {
  const t = fullText.toLowerCase();
  if (t.includes('isybank') || t.includes('isybitmm')) return 'isybank';
  if (t.includes('intesa sanpaolo') || t.includes('cariplo')) return 'intesa';
  if (t.includes('unicredit')) return 'unicredit';
  if (t.includes('banco bpm') || t.includes('webank')) return 'bpm';
  return 'generic';
}

const BANK_LABELS: Record<PDFBank, string> = {
  isybank: 'Isybank',
  intesa: 'Intesa Sanpaolo',
  unicredit: 'UniCredit',
  bpm: 'BancoBPM',
  generic: 'Banca (PDF)',
};

// ── Column calibration ───────────────────────────────────────────────────────

interface Columns {
  descMaxX: number;   // rightmost x of description area
  debitMinX: number;  // left edge of debit (ADDEBITI) column
  creditMinX: number; // left edge of credit (ACCREDITI) column
}

/**
 * Scan all items for a header row containing debit + credit column headers
 * and return calibrated column boundaries.
 */
function calibrateColumns(allItems: PDFItem[], pageWidth: number): Columns {
  const DEBIT_RE = /^(?:addebiti|dare|uscite)$/i;
  const CREDIT_RE = /^(?:accrediti|avere|entrate)$/i;

  const rowMap = groupIntoRows(allItems);

  for (const [, row] of rowMap) {
    const rowText = row.map((r) => r.str.trim()).join(' ').toLowerCase();
    const hasDebit = DEBIT_RE.test(row.map((r) => r.str.trim()).find((s) => DEBIT_RE.test(s)) ?? '');
    const hasCredit = CREDIT_RE.test(row.map((r) => r.str.trim()).find((s) => CREDIT_RE.test(s)) ?? '');
    if (!hasDebit || !hasCredit) continue;

    let debitX = 0, creditX = 0;
    for (const it of row) {
      if (DEBIT_RE.test(it.str.trim())) debitX = it.x;
      if (CREDIT_RE.test(it.str.trim())) creditX = it.x;
    }
    if (debitX > 0 && creditX > debitX) {
      return {
        descMaxX: debitX - 5,
        debitMinX: debitX - 10,
        creditMinX: creditX - 10,
      };
    }
  }

  // Fallback: rightmost 40% of page = amounts; right half = credit
  return {
    descMaxX: pageWidth * 0.57,
    debitMinX: pageWidth * 0.57,
    creditMinX: pageWidth * 0.77,
  };
}

// ── Merchant extraction (Isybank-specific) ───────────────────────────────────

function extractMerchant(typeKeyword: string, descLines: string[]): string {
  const type = typeKeyword.trim();
  const desc = descLines.join(' ').replace(/\s{2,}/g, ' ').trim();

  if (/^Pagamento POS$/i.test(type) || /^Pagamento effettuato su POS estero/i.test(type)) {
    const m = desc.match(/PRESSO\s+([A-Z0-9 .*/'&,-]{3,50?}?)(?:\s{3,}|$)/);
    if (m) return clean(m[1]);
    const m2 = desc.match(/PRESSO\s+([^\n]{3,40})/);
    if (m2) return clean(m2[1].replace(/\s+[A-Z]{1,3}$/, ''));
  }

  if (/^Pagamento Tramite POS/i.test(type)) {
    const first = descLines[0] ?? '';
    return clean(
      first
        .replace(/\s+[A-Z]{2,5}\d{2}\/\d{2}-\d{2}:\d{2}.*$/, '')
        .replace(/\s+\d{2}\/\d{2}-\d{2}:\d{2}.*$/, '')
        .replace(/\s+(VIA|VIALE|PIAZZA|PIAZZ|CORSO|LOC\.|S\.P\.)\b.*/i, '')
        .replace(/\s+-\s*$/, ''),
    );
  }

  if (/^Pagamento BANCOMAT PAY/i.test(type)) {
    const m = desc.match(/presso\s+(.+?)\s+data:/i);
    if (m) return clean(m[1]);
    const m2 = (descLines[0] ?? '').match(/presso\s+(.+)/i);
    if (m2) return clean(m2[1]);
  }

  if (/^Pagamento ADUE/i.test(type)) {
    const m = desc.match(/NOME:\s*(.+?)\s+MANDATO:/i) ?? desc.match(/NOME:\s*(.+)/i);
    if (m) return clean(m[1].slice(0, 40));
  }

  if (/^Bonifico da Voi disposto a favore di:/i.test(type)) {
    const afterColon = type.replace(/^Bonifico da Voi disposto a favore di:\s*/i, '').trim();
    const candidate = afterColon.length > 1
      ? (afterColon + ' ' + (descLines[0] ?? '')).trim()
      : (descLines[0] ?? '');
    return clean(candidate.replace(/\s+[A-Z0-9]{10,}.*$/, '').slice(0, 50));
  }

  if (/^Bonifico a Vostro favore/i.test(type)) {
    const m = desc.match(/MITT\.:\s*(.+?)(?:\s+COD\.DISP\.|$)/i);
    if (m) return clean(m[1].slice(0, 50));
    const first = descLines[0] ?? '';
    if (first && !/^COD\.DISP/i.test(first)) return clean(first.slice(0, 50));
  }

  if (/^Trasferimento denaro BANCOMAT Pay/i.test(type)) {
    const first = descLines[0] ?? '';
    const m = (desc + first).match(/^Da\s+(.+?)\s+data:/i);
    if (m) return clean(m[1]);
  }

  if (/^Accredito/i.test(type)) return 'Accredito';

  return clean(type.slice(0, 50));
}

function isTransferType(typeKeyword: string, descLines: string[]): boolean {
  const combined = (typeKeyword + ' ' + descLines.join(' ')).toLowerCase();
  return combined.includes('giroconto') || combined.includes('trasferimento interno');
}

// ── Core parser ───────────────────────────────────────────────────────────────
/**
 * Unified parser for all Italian bank PDFs.
 *
 * 1. Calibrate ADDEBITI/ACCREDITI column x-positions from the header row.
 * 2. For each row (sorted top→bottom, across all pages):
 *    a. Date-pair row → new transaction; amount column determines sign.
 *    b. Description row → accumulate text for the current transaction.
 * 3. Flush the last pending transaction at end.
 */
function parseItalianPDF(
  pages: PDFItem[][],
  widths: number[],
  bankName: string,
): ParseResult {
  // Flatten all items for column calibration
  const allItems = pages.flat();
  const avgWidth = widths.reduce((s, w) => s + w, 0) / (widths.length || 1);
  const cols = calibrateColumns(allItems, avgWidth);

  const transactions: Omit<import('../types').Transaction, 'id'>[] = [];
  let skipped = 0;

  let pending: TxRow | null = null;

  const flush = () => {
    if (!pending) return;
    const date = pending.dateContabile;
    if (!date) { skipped++; pending = null; return; }

    const amount = pending.amount * pending.sign;

    // Extract merchant — bank-specific or generic
    let merchant = extractMerchant(pending.typeKeyword, pending.descLines);
    if (!merchant) {
      merchant = pending.descLines[0]?.trim().slice(0, 60) ?? pending.typeKeyword.slice(0, 50);
    }
    const description = merchant || 'Transazione';

    let category = categorize(description);
    if (isTransferType(pending.typeKeyword, pending.descLines)) category = 'transfer';
    // Incoming bank transfers: if credit and keyword says "bonifico a vostro favore"
    // → income category, not transfer
    if (
      pending.sign === 1 &&
      /^Bonifico a Vostro favore/i.test(pending.typeKeyword)
    ) {
      // Keep categorize() decision (likely 'other' or income)
    }

    transactions.push({ date, amount, description, merchant, category, note: '' });
    pending = null;
  };

  for (let pi = 0; pi < pages.length; pi++) {
    const pageItems = pages[pi];
    const rowMap = groupIntoRows(pageItems);
    const rows = sortedRows(rowMap);
    let seenHeader = false;

    for (const [, row] of rows) {
      const rowText = row.map((r) => r.str).join('').trim();
      if (!rowText) continue;

      // Detect and skip header rows (DATA CONTABILE etc.)
      if (/DATA CONTABILE|ADDEBITI|ACCREDITI|DARE|AVERE|ENTRATE|USCITE/i.test(rowText)) {
        seenHeader = true;
        continue;
      }

      // Skip noise lines
      if (isNoiseLine(rowText)) continue;

      // Check if row starts with date pattern
      const dates = extractDates(row);
      if (dates) {
        flush();
        seenHeader = true; // treat as having seen data section

        // Find amount item in this row (by x-position)
        let amount = 0;
        let sign: 1 | -1 = -1;
        for (const it of row) {
          const am = it.str.match(AMT_RE);
          if (am) {
            amount = parseItalianAmt(am[1]);
            sign = it.x >= cols.creditMinX ? 1 : -1;
            break;
          }
        }

        // Extract type keyword: items between dates and amount column
        const typeItems = row.filter(
          (it) =>
            it.x >= cols.descMaxX - 200 && // rough description area
            it.x < cols.debitMinX &&
            !DATE_DOT_RE.test(it.str.trim()) &&
            !DATE_SLASH_RE.test(it.str.trim()) &&
            !AMT_RE.test(it.str),
        );
        const typeKeyword = typeItems.map((it) => it.str).join('').trim();

        if (amount > 0) {
          pending = {
            dateContabile: dates.d1,
            dateOp: dates.d2,
            typeKeyword,
            amount,
            sign,
            descLines: [],
          };
        } else {
          // No amount on this row — amount may be on a description sub-row
          // (rare edge case for some banks that put the amount below)
          pending = {
            dateContabile: dates.d1,
            dateOp: dates.d2,
            typeKeyword,
            amount: 0,
            sign: -1,
            descLines: [],
          };
        }
        continue;
      }

      // Not a date row — accumulate as description (only if we've seen the header)
      if (!seenHeader || !pending) continue;

      // Check if row contains an amount (for banks where amount is on a sub-row)
      if (pending.amount === 0) {
        for (const it of row) {
          const am = it.str.match(AMT_RE);
          if (am) {
            pending.amount = parseItalianAmt(am[1]);
            pending.sign = it.x >= cols.creditMinX ? 1 : -1;
            break;
          }
        }
      }

      // Add non-amount parts to description
      const descText = row
        .filter((it) => !AMT_RE.test(it.str))
        .map((it) => it.str)
        .join('')
        .trim();
      if (descText) pending.descLines.push(descText);
    }
  }
  flush();

  // Remove transactions with amount=0 (failed to parse)
  const valid = transactions.filter((t) => t.amount !== 0);
  skipped += transactions.length - valid.length;

  return { transactions: valid, bankName, skipped };
}

/** Extract a date pair or single date from a row of items. */
function extractDates(row: PDFItem[]): { d1: string; d2: string } | null {
  const dates: string[] = [];
  for (const it of row) {
    const s = it.str.trim();
    const iso = toISO(s);
    if (iso) dates.push(iso);
    if (dates.length === 2) break;
  }
  if (dates.length >= 2) return { d1: dates[0], d2: dates[1] };
  if (dates.length === 1) return { d1: dates[0], d2: dates[0] };
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function parsePDF(uri: string): Promise<ParseResult> {
  const { pages, widths } = await extractPDFItems(uri);

  const fullText = pages.flatMap((p) => p.map((it) => it.str)).join(' ');
  const bank = detectBank(fullText);
  const bankName = BANK_LABELS[bank];

  return parseItalianPDF(pages, widths, bankName);
}
