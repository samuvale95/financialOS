/**
 * Import Log System
 *
 * Tiene un log rolling delle ultime MAX_SESSIONS sessioni di importazione,
 * incluso il testo completo inviato a ogni modello AI e la risposta raw.
 * Utile per debugging errori nel conteggio entrate/uscite confrontando ciò
 * che il modello ha ricevuto con il PDF originale.
 *
 * IMPORTANTE: questo file usa un path NON incluso in PATHS (storage.ts),
 * quindi NON viene cancellato dal resetAll() / "Cancella tutti i dati".
 */

import * as FileSystem from 'expo-file-system/legacy';

const LOG_PATH = `${FileSystem.documentDirectory!}financialOS_import_logs.json`;
const MAX_SESSIONS = 30;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChunkLog {
  chunkIndex: number;     // 0-based
  totalChunks: number;
  inputText: string;      // testo completo inviato al modello per questo chunk
  rawAIResponse: string;  // risposta raw del modello
  txCount: number;        // transazioni estratte da questo chunk
  inputChars: number;     // lunghezza del testo inviato
}

export interface ImportLogSession {
  id: string;
  startedAt: string;       // ISO 8601
  finishedAt?: string;
  fileName: string;
  model: string;           // 'gpt-4o-mini' | 'gemini-2.5-flash' | 'cache' | ...
  strategy: string;        // 'smart' | 'full_ai'
  tier?: string;           // 'L1_cache' | 'L2_schema' | 'L3_full_ai'
  chunks: ChunkLog[];      // ogni chunk inviato all'AI (vuoto se L1/L2)
  totalTransactions: number;
  totalIncome: number;     // somma entrate (>0) in euro
  totalExpenses: number;   // somma uscite (<0) in euro (valore assoluto)
  processingTimeMs: number;
  error?: string;
}

// ── Singleton in-memory session ───────────────────────────────────────────────

interface _ActiveSession {
  id: string;
  startedAt: string;
  fileName: string;
  model: string;
  strategy: string;
  chunks: ChunkLog[];
}

let _activeSession: _ActiveSession | null = null;

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Inizia una nuova sessione di log. Restituisce l'ID della sessione.
 * Deve essere chiamato prima dell'inizio del parsing.
 */
export function startLogSession(fileName: string, model: string, strategy: string): string {
  const id = `ls_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  _activeSession = {
    id,
    startedAt: new Date().toISOString(),
    fileName,
    model,
    strategy,
    chunks: [],
  };
  return id;
}

/**
 * Aggiunge il log di un chunk AI. Chiamato da openaiParser/geminiParser dopo ogni request.
 * No-op se non c'è una sessione attiva.
 */
export function appendChunkLog(
  chunkIndex: number,
  totalChunks: number,
  inputText: string,
  rawAIResponse: string,
  txCount: number,
): void {
  if (!_activeSession) return;
  _activeSession.chunks.push({
    chunkIndex,
    totalChunks,
    inputText,
    rawAIResponse,
    txCount,
    inputChars: inputText.length,
  });
}

/**
 * Finalizza la sessione corrente e la persiste su disco.
 * Azzera sempre _activeSession anche in caso di errore scrittura.
 */
export async function finishLogSession(
  transactions: { amount: number }[],
  processingTimeMs: number,
  tier?: string,
  errorMessage?: string,
): Promise<void> {
  if (!_activeSession) return;
  const session = _activeSession;
  _activeSession = null;

  const totalIncome = transactions
    .filter((t) => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const logEntry: ImportLogSession = {
    id: session.id,
    startedAt: session.startedAt,
    finishedAt: new Date().toISOString(),
    fileName: session.fileName,
    model: session.model,
    strategy: session.strategy,
    tier,
    chunks: session.chunks,
    totalTransactions: transactions.length,
    totalIncome,
    totalExpenses,
    processingTimeMs,
    error: errorMessage,
  };

  try {
    const existing = await loadImportLogs();
    const updated = [logEntry, ...existing].slice(0, MAX_SESSIONS);
    await FileSystem.writeAsStringAsync(LOG_PATH, JSON.stringify(updated));
  } catch (e) {
    console.warn('[ImportLogger] errore scrittura log:', e);
  }
}

/** Restituisce tutte le sessioni, dalla più recente alla più vecchia. */
export async function loadImportLogs(): Promise<ImportLogSession[]> {
  try {
    const info = await FileSystem.getInfoAsync(LOG_PATH);
    if (!info.exists) return [];
    return JSON.parse(await FileSystem.readAsStringAsync(LOG_PATH)) as ImportLogSession[];
  } catch {
    return [];
  }
}

/** Cancella tutti i log. Non viene chiamato da resetAll(). */
export async function clearImportLogs(): Promise<void> {
  try {
    await FileSystem.deleteAsync(LOG_PATH, { idempotent: true });
  } catch {
    // ignore
  }
}
