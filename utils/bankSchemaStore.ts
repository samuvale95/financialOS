/**
 * Persistenza degli schemi di parsing per banca.
 * Un schema viene salvato la prima volta che si importa un file da una nuova banca
 * (tramite LLM) e riutilizzato per tutti gli import successivi (parsing locale, zero AI).
 */
import * as FileSystem from 'expo-file-system/legacy';

const SCHEMA_FILE = (FileSystem.documentDirectory ?? '') + 'bank_schemas.json';

export interface BankParsingSchema {
  bankName: string;
  fileType: 'csv' | 'xlsx';
  /** Delimiter CSV (';', ',', '\t') */
  delimiter?: string;
  /** Righe di intestazione da saltare (0-based) */
  skipRows: number;
  /** Indice colonna data */
  dateCol: number;
  /** Formato data: 'DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', ecc. */
  dateFormat: string;
  /** Indice colonna importo unificato (negativo = uscita). null se separato. */
  amountCol: number | null;
  /** Indice colonna entrate (importo positivo). null se non esiste. */
  creditCol: number | null;
  /** Indice colonna uscite (importo positivo = uscita). null se non esiste. */
  debitCol: number | null;
  /** Indice colonna descrizione/causale */
  descCol: number;
  /** Indice colonna merchant (opzionale) */
  merchantCol?: number | null;
  /** Separatore decimale: ',' o '.' */
  decSep: ',' | '.';
  savedAt: string;
}

type SchemaStore = Record<string, BankParsingSchema>;

async function loadStore(): Promise<SchemaStore> {
  try {
    const info = await FileSystem.getInfoAsync(SCHEMA_FILE);
    if (!info.exists) return {};
    return JSON.parse(await FileSystem.readAsStringAsync(SCHEMA_FILE));
  } catch {
    return {};
  }
}

async function saveStore(store: SchemaStore): Promise<void> {
  await FileSystem.writeAsStringAsync(SCHEMA_FILE, JSON.stringify(store, null, 2));
}

function normalizeKey(bankName: string): string {
  return bankName.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export async function getSchema(bankName: string): Promise<BankParsingSchema | null> {
  const store = await loadStore();
  return store[normalizeKey(bankName)] ?? null;
}

export async function saveSchema(schema: BankParsingSchema): Promise<void> {
  const store = await loadStore();
  store[normalizeKey(schema.bankName)] = { ...schema, savedAt: new Date().toISOString() };
  await saveStore(store);
}

export async function listSchemas(): Promise<BankParsingSchema[]> {
  const store = await loadStore();
  return Object.values(store);
}

export async function deleteSchema(bankName: string): Promise<void> {
  const store = await loadStore();
  delete store[normalizeKey(bankName)];
  await saveStore(store);
}

export async function clearAllSchemas(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(SCHEMA_FILE);
    if (info.exists) await FileSystem.deleteAsync(SCHEMA_FILE);
  } catch { /* ignore */ }
}
