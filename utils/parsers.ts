import type { Transaction } from '../types';
import { categorize } from './categorizer';

export interface ParseResult {
  transactions: Omit<Transaction, 'id'>[];
  bankName: string;
  skipped: number;
  /** Schema di parsing estratto dall'AI (solo primo import per banca CSV/XLSX). */
  parsingSchema?: import('./bankSchemaStore').BankParsingSchema;
  /** Tier raggiunto dal smart parser — impostato da parseWithSmartParser. */
  _tier?: 'L1_cache' | 'L2_schema' | 'L3_full_ai';
  /** Presente se il file è stato troncato prima dell'invio all'AI. */
  truncationWarning?: {
    totalLines: number;
    includedLines: number;
    message: string;
  };
}

type BankType = 'isybank' | 'intesa' | 'unicredit' | 'revolut' | 'n26' | 'generic';

function detectBank(headerLine: string): { bank: BankType; delimiter: string } {
  const h = headerLine.toLowerCase();
  if (h.includes('operazione') && h.includes('importo') && h.includes('contabilizzazione')) {
    return { bank: 'isybank', delimiter: ';' };
  }
  if (h.includes('entrate') && h.includes('uscite') && h.includes('causale')) {
    return { bank: 'intesa', delimiter: ';' };
  }
  if (h.includes('dare') && h.includes('avere')) {
    return { bank: 'unicredit', delimiter: ';' };
  }
  if (h.includes('started date') && h.includes('state')) {
    return { bank: 'revolut', delimiter: ',' };
  }
  if (h.includes('payee') && h.includes('payment reference')) {
    return { bank: 'n26', delimiter: ',' };
  }
  return { bank: 'generic', delimiter: ',' };
}

// Scans first 30 lines to find the real header row (needed for Isybank which
// has 17 rows of metadata before the actual column headers).
function findHeaderLine(lines: string[]): { headerIndex: number; headerLine: string } {
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('data') && lower.includes('importo')) {
      return { headerIndex: i, headerLine: lines[i] };
    }
  }
  return { headerIndex: 0, headerLine: lines[0] };
}

function parseItalianDate(dateStr: string): string | null {
  const s = dateStr.trim();
  if (!s) return null;
  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return isNaN(Date.parse(s)) ? null : s;
  }
  // D/M/YYYY, DD/MM/YYYY, DD/MM/YY
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  let year = match[3];
  if (year.length === 2) year = `20${year}`;
  const iso = `${year}-${month}-${day}`;
  if (isNaN(Date.parse(iso))) return null;
  return iso;
}

function parseItalianAmount(raw: string): number {
  const s = raw.trim().replace(/[€\s]/g, '');
  // Italian: 1.234,56 — period=thousands, comma=decimal
  if (s.includes(',') && s.includes('.')) {
    // Determine which is decimal separator by position
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Italian format: 1.234,56
      return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    } else {
      // English format: 1,234.56
      return parseFloat(s.replace(/,/g, ''));
    }
  }
  if (s.includes(',')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(s);
}

// For Isybank: amounts use English format (comma=thousands, period=decimal)
// e.g. -1,000.00 → -1000, -54.50 → -54.5, 9.00 → 9
function parseEnglishAmount(raw: string): number {
  const s = raw.trim().replace(/[€\s]/g, '').replace(/,/g, '');
  return parseFloat(s);
}

export function splitCSVLine(line: string, delimiter: string): string[] {
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

const BANK_NAMES: Record<BankType, string> = {
  isybank: 'Isybank',
  intesa: 'Intesa Sanpaolo',
  unicredit: 'UniCredit',
  revolut: 'Revolut',
  n26: 'N26',
  generic: 'Generico',
};

export function parseCSV(content: string): ParseResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { transactions: [], bankName: 'Sconosciuto', skipped: 0 };

  // Find the real header (handles banks with metadata rows before column headers)
  const { headerIndex, headerLine } = findHeaderLine(lines);
  const { bank, delimiter } = detectBank(headerLine);
  const dataLines = lines.slice(headerIndex + 1);

  const transactions: Omit<Transaction, 'id'>[] = [];
  let skipped = 0;

  for (const line of dataLines) {
    const cols = splitCSVLine(line, delimiter);
    try {
      let date: string | null = null;
      let amount = 0;
      let description = '';

      if (bank === 'isybank') {
        // Col: Data(0) | Operazione(1) | Dettagli(2) | Conto o carta(3) |
        //      Contabilizzazione(4) | Categoria(5) | Valuta(6) | Importo(7)
        date = parseItalianDate(cols[0] ?? '');
        description = (cols[1] ?? '').trim();
        amount = parseEnglishAmount(cols[7] ?? '0');
      } else if (bank === 'intesa') {
        date = parseItalianDate(cols[0] ?? '');
        const entrate = parseItalianAmount(cols[2] ?? '0') || 0;
        const uscite = parseItalianAmount(cols[3] ?? '0') || 0;
        description = (cols[4] ?? '').trim();
        amount = entrate > 0 ? entrate : -Math.abs(uscite);
      } else if (bank === 'unicredit') {
        date = parseItalianDate(cols[0] ?? '');
        description = (cols[2] ?? '').trim();
        const dare = parseItalianAmount(cols[3] ?? '0') || 0;
        const avere = parseItalianAmount(cols[4] ?? '0') || 0;
        amount = avere > 0 ? avere : -Math.abs(dare);
      } else if (bank === 'revolut') {
        const state = (cols[3] ?? '').trim().toUpperCase();
        if (state !== 'COMPLETED') { skipped++; continue; }
        const rawDate = (cols[2] ?? '').trim().split(' ')[0];
        date = rawDate.includes('-') ? rawDate : parseItalianDate(rawDate);
        description = (cols[4] ?? '').trim();
        amount = parseFloat((cols[5] ?? '0').replace(',', '.'));
      } else if (bank === 'n26') {
        const rawDate = (cols[0] ?? '').trim();
        date = rawDate.includes('-') ? rawDate : parseItalianDate(rawDate);
        description = (cols[1] ?? '').trim();
        amount = parseFloat((cols[5] ?? '0').replace(',', '.'));
      } else {
        date = parseItalianDate(cols[0] ?? '');
        if (!date && cols[0] && !isNaN(Date.parse(cols[0]))) date = cols[0].trim();
        description = (cols[1] ?? '').trim();
        const lastCol = cols[cols.length - 1] ?? '0';
        amount = parseItalianAmount(lastCol) || 0;
      }

      if (!date || isNaN(Date.parse(date)) || amount === 0 || description === '') {
        skipped++;
        continue;
      }

      transactions.push({
        date,
        amount,
        description,
        category: categorize(description),
        merchant: description,
      });
    } catch {
      skipped++;
    }
  }

  transactions.sort((a, b) => b.date.localeCompare(a.date));
  return { transactions, bankName: BANK_NAMES[bank], skipped };
}
