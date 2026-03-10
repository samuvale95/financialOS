/**
 * Parser smart a 3 livelli — minimizza le chiamate AI e i costi:
 *
 * 1. Cache hit (per nome file)   → 0 chiamate AI
 * 2. Schema locale (CSV/XLSX)    → 0 chiamate AI per parsing
 *                                  + 1 chiamata mini per merchant sconosciuti
 * 3. Primo import / PDF          → 1 chiamata AI completa (salva schema)
 */
import { getCachedResult, setCachedResult } from './aiParserCache';
import { getSchema, saveSchema } from './bankSchemaStore';
import { parseWithSchema } from './schemaBasedParser';
import { enrichCategories } from './merchantCategorizerAI';
import type { ParseResult } from './parsers';

export type AIProvider = 'openai' | 'gemini';

interface SmartParseOptions {
  /** Se true: controlla cache per nome file prima di tutto */
  useCache: boolean;
  /** Provider AI da usare per prima elaborazione / arricchimento categorie */
  provider: AIProvider;
  /** Funzione che chiama l'AI completa (gemini o openai) — usata solo al primo import */
  fullAIParser: (uri: string, name: string) => Promise<ParseResult>;
  /** Callback chiamata ogni volta che viene salvato uno schema nuovo */
  onSchemaLearned?: (bankName: string) => void;
}

export async function parseWithSmartParser(
  uri: string,
  fileName: string,
  opts: SmartParseOptions,
): Promise<ParseResult> {
  const lowerName = fileName.toLowerCase();
  const isPDF = lowerName.endsWith('.pdf');

  // ── Livello 1: Cache per nome file ────────────────────────────────────────
  if (opts.useCache) {
    const cached = await getCachedResult(fileName);
    if (cached) {
      console.log(`[SmartParser] L1 cache hit: "${fileName}"`);
      return { ...cached, _tier: 'L1_cache' as const };
    }
  }

  // ── Livello 2: Schema locale (CSV / XLSX) ─────────────────────────────────
  if (!isPDF) {
    // Per trovare lo schema dobbiamo conoscere la banca.
    // Prova a leggere l'intestazione del file per bank detection locale,
    // poi cerca uno schema per quella banca.
    const bankName = await detectBankFromFile(uri, lowerName);
    if (bankName) {
      const schema = await getSchema(bankName);
      if (schema) {
        console.log(`[SmartParser] L2 schema locale: "${bankName}" (${schema.fileType})`);
        try {
          let result = await parseWithSchema(uri, schema);
          // Arricchisci solo i merchant sconosciuti
          result = await enrichCategories(result, opts.provider);
          result = { ...result, _tier: 'L2_schema' as const };
          if (opts.useCache) await setCachedResult(fileName, result);
          return result;
        } catch (e) {
          console.warn('[SmartParser] schema locale fallito, fallback AI:', e);
        }
      }
    }
  }

  // ── Livello 3: AI completa (primo import o PDF) ────────────────────────────
  console.log(`[SmartParser] L3 AI completa: "${fileName}"`);
  const aiResult = await opts.fullAIParser(uri, fileName);
  const result: import('./parsers').ParseResult = { ...aiResult, _tier: 'L3_full_ai' as const };

  // Salva schema se presente (CSV/XLSX)
  if (result.parsingSchema) {
    await saveSchema(result.parsingSchema);
    console.log(`[SmartParser] schema salvato per: "${result.bankName}"`);
    opts.onSchemaLearned?.(result.bankName);
  }

  // Salva cache
  if (opts.useCache) await setCachedResult(fileName, result);

  return result;
}

// ── Bank detection locale (senza AI) ─────────────────────────────────────────

async function detectBankFromFile(uri: string, lowerName: string): Promise<string | null> {
  try {
    let headerText: string;

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.ods')) {
      const { default: XLSX } = await import('xlsx');
      const FileSystem = await import('expo-file-system/legacy');
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: (FileSystem as any).EncodingType.Base64,
      });
      const wb = XLSX.read(base64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      headerText = XLSX.utils.sheet_to_csv(ws).slice(0, 500);
    } else {
      const FileSystem = await import('expo-file-system/legacy');
      const text = await FileSystem.readAsStringAsync(uri, {
        encoding: (FileSystem as any).EncodingType.UTF8,
      });
      headerText = text.slice(0, 500);
    }

    return detectBankFromHeader(headerText);
  } catch {
    return null;
  }
}

function detectBankFromHeader(header: string): string | null {
  const h = header.toLowerCase();
  if (h.includes('fineco')) return 'Fineco';
  if (h.includes('unicredit')) return 'UniCredit';
  if (h.includes('intesa') || h.includes('isybank')) return 'Intesa Sanpaolo';
  if (h.includes('revolut')) return 'Revolut';
  if (h.includes('n26')) return 'N26';
  if (h.includes('bbva')) return 'BBVA';
  if (h.includes('mediolanum')) return 'Banca Mediolanum';
  if (h.includes('bnl')) return 'BNL';
  if (h.includes('monte dei paschi') || h.includes('mps')) return 'Monte dei Paschi';
  if (h.includes('banco bpm') || h.includes('bancobpm')) return 'Banco BPM';
  if (h.includes('credem')) return 'Credem';
  if (h.includes('bper')) return 'BPER';
  return null;
}
