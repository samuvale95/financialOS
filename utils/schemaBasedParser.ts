/**
 * Parser locale basato su schema salvato.
 * Nessuna chiamata AI — usa lo schema per mappare colonne, date e importi.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import type { BankParsingSchema } from './bankSchemaStore';
import type { ParseResult } from './parsers';
import type { CategoryId } from '../constants/categories';
import { categorize } from './categorizer';

// ── Date parsing ─────────────────────────────────────────────────────────────

function parseDate(raw: string, fmt: string): string {
  const s = raw.trim();
  // Normalize separators
  const parts = s.split(/[\/\-\.]/).map(p => p.trim());
  if (parts.length !== 3) return s;

  let d: string, m: string, y: string;
  const fmtUp = fmt.toUpperCase();

  if (fmtUp.startsWith('DD')) {
    [d, m, y] = parts;
  } else if (fmtUp.startsWith('MM')) {
    [m, d, y] = parts;
  } else {
    // YYYY-MM-DD or YYYY/MM/DD
    [y, m, d] = parts;
  }

  if (!y || !m || !d) return s;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ── Amount parsing ────────────────────────────────────────────────────────────

function parseAmount(raw: string | number | undefined, decSep: ',' | '.'): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s) return 0;
  // Remove currency symbols and spaces
  let cleaned = s.replace(/[€$£\s]/g, '');
  if (decSep === ',') {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }
  return parseFloat(cleaned) || 0;
}

// ── CSV row parser ────────────────────────────────────────────────────────────

function splitCsvRow(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function parseWithSchema(
  uri: string,
  schema: BankParsingSchema,
): Promise<ParseResult> {
  let rows: string[][];

  if (schema.fileType === 'xlsx') {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64 as any,
    });
    const wb = XLSX.read(base64, { type: 'base64' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ';' });
    rows = csv.split('\n').map(line => splitCsvRow(line, ';'));
  } else {
    const text = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const delimiter = schema.delimiter ?? ';';
    rows = text.split('\n').map(line => splitCsvRow(line, delimiter));
  }

  const dataRows = rows.slice(schema.skipRows).filter(r => r.some(c => c.trim() !== ''));

  const transactions: Omit<import('../types').Transaction, 'id'>[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    try {
      const rawDate = row[schema.dateCol] ?? '';
      const date = parseDate(rawDate, schema.dateFormat);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }

      let amount: number;
      if (schema.amountCol !== null && schema.amountCol !== undefined) {
        amount = parseAmount(row[schema.amountCol], schema.decSep);
      } else if (schema.creditCol !== null && schema.debitCol !== null) {
        const credit = parseAmount(row[schema.creditCol!], schema.decSep);
        const debit = parseAmount(row[schema.debitCol!], schema.decSep);
        amount = credit > 0 ? credit : -debit;
      } else {
        skipped++; continue;
      }

      if (amount === 0) { skipped++; continue; }

      const description = (row[schema.descCol] ?? '').trim();
      if (!description) { skipped++; continue; }

      const merchant = schema.merchantCol != null ? (row[schema.merchantCol] ?? '').trim() : undefined;
      const category = categorize(description) as CategoryId;

      transactions.push({
        date,
        amount,
        description: description.slice(0, 80),
        merchant: merchant ? merchant.slice(0, 60) : undefined,
        category,
        note: '',
        isTransfer: false,
      });
    } catch {
      skipped++;
    }
  }

  console.log(`[SchemaParser] ${schema.bankName}: ${transactions.length} transazioni, ${skipped} saltate`);

  return {
    transactions,
    bankName: schema.bankName,
    skipped,
  };
}
