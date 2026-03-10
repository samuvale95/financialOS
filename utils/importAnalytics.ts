/**
 * Analytics per ogni sessione di importazione.
 *
 * IMPORTANTE: questo file usa un path NON incluso in PATHS (storage.ts),
 * quindi NON viene cancellato dal resetAll() / "Cancella tutti i dati".
 * I dati persistono per sempre, anche dopo reset completo.
 */
import * as FileSystem from 'expo-file-system/legacy';

// Separato dai PATHS di storage.ts → immune a clearAllData()
const PATH = `${FileSystem.documentDirectory!}financialOS_import_analytics.json`;

export type ImportTier = 'L1_cache' | 'L2_schema' | 'L3_full_ai';
export type ImportModel = 'openai' | 'gemini' | 'none';
export type ImportStrategy = 'smart' | 'full_ai';

export interface ImportEventLog {
  id: string;
  timestamp: string;          // ISO 8601
  fileName: string;
  strategy: ImportStrategy;   // strategia usata
  tier: ImportTier;           // livello smart parser raggiunto
  model: ImportModel;         // modello AI usato ('none' se L1)
  processingTimeMs: number;   // durata totale parseFn
  transactionsExtracted: number;
  bankName: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function loadRaw(): Promise<ImportEventLog[]> {
  try {
    const info = await FileSystem.getInfoAsync(PATH);
    if (!info.exists) return [];
    return JSON.parse(await FileSystem.readAsStringAsync(PATH)) as ImportEventLog[];
  } catch {
    return [];
  }
}

async function saveRaw(data: ImportEventLog[]): Promise<void> {
  await FileSystem.writeAsStringAsync(PATH, JSON.stringify(data));
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Aggiunge un evento al log. Fire-and-forget safe. */
export async function logImportEvent(
  ev: Omit<ImportEventLog, 'id' | 'timestamp'>,
): Promise<void> {
  const events = await loadRaw();
  events.push({
    id: `ie_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...ev,
  });
  await saveRaw(events);
}

/** Restituisce tutti gli eventi, dal più recente al più vecchio. */
export async function loadImportAnalytics(): Promise<ImportEventLog[]> {
  const events = await loadRaw();
  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Cancella il log analytics.
 * Non viene chiamato da resetAll() — deve essere invocato esplicitamente
 * dalla schermata Analytics.
 */
export async function clearImportAnalytics(): Promise<void> {
  await FileSystem.deleteAsync(PATH, { idempotent: true });
}
