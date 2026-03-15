/**
 * Gemini parser for bank statements.
 *
 * Uses Google Gemini to parse and categorise transactions from any file format:
 *   - PDF  → sent as base64 inline_data (Gemini reads it natively, no text extraction)
 *   - XLSX → converted to CSV via SheetJS, then sent as text
 *   - CSV / TXT → sent as raw text
 *
 * Requires a Gemini API key from https://aistudio.google.com/app/apikey
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { appendChunkLog } from './importLogger';
import type { ParseResult } from './parsers';
import type { CategoryId } from '../constants/categories';

// streamGenerateContent keeps the connection alive via continuous chunks,
// preventing iOS/Expo Go from dropping long-running requests.

/** Full model — used for PDFs (better vision + layout understanding). */
const GEMINI_ENDPOINT_FULL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent';

/** Lite model — used for CSV/XLSX (structured text, lower cost). */
const GEMINI_ENDPOINT_LITE =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

/** True when the app has a Gemini key baked in — use to gate AI parsing. */
export const hasGemini = Boolean(GEMINI_API_KEY);

// Diagnostic: printed once when the module loads
console.log('[Gemini] modulo caricato | EXPO_PUBLIC_GEMINI_API_KEY presente:', Boolean(GEMINI_API_KEY), '| hasGemini:', hasGemini);

// ── Prompts ───────────────────────────────────────────────────────────────────

/** Compact prompt for PDF (sent alongside the native PDF file). */
const PROMPT_PDF = `Estrai TUTTE le transazioni dall'estratto conto italiano allegato. Rispondi SOLO con JSON valido.

REGOLE:
1. date YYYY-MM-DD (deduci anno dal contesto se mancante).
2. amount: neg=uscita, pos=entrata. Deduci il segno dalla colonna del documento, tipo operazione e causale.
3. description: breve, italiano, Title Case, max 60 car.
4. merchant: solo brand senza suffissi legali (Spa/Srl/ecc.), "" se n/a.
5. location: solo se fisico con indirizzo visibile, altrimenti "".
6. category: ID esatto dalla lista. Se incerto: "other".
7. note: info extra utile, "" se vuoto.

CATEGORIE: groceries(supermercato/GDO), restaurants(ristoranti/bar/fast-food/caffè), food(alimentari/gastronomie/mercati), fuel(carburante/benzinai), public_transport(ATM/Trenitalia/bus/metro/Flixbus), transport(taxi/Uber/parcheggi/pedaggi/Telepass), shopping(Amazon/Zara/H&M/IKEA/abbigliamento/elettronica), entertainment(cinema/concerti/eventi/gaming), sports(palestra/fitness/yoga), health(medico/cliniche/dentista/ottico), pharmacy(farmacia/parafarmacia), home(arredamento/elettrodomestici/Leroy Merlin), rent(affitto/mutuo), utilities(bollette luce/gas/acqua/telefono/internet), insurance(assicurazioni), subscriptions(Netflix/Spotify/Apple/Google/Microsoft/abbonamenti digitali), travel(voli/hotel/Booking/Airbnb/ITA), education(corsi/università/libri/Udemy), beauty(parrucchiere/estetista/Douglas/Sephora), pets(veterinario/petshop/Arcaplanet), taxes(F24/INPS/bollo auto/Agenzia Entrate), salary(stipendio/accredito datore di lavoro), freelance(compensi professionali/pagamenti clienti), investment(ETF/azioni/crypto/dividendi/Degiro), transfer(giroconto tra propri conti/bonifico a se stessi), other(tutto il resto).

OUTPUT: {"bankName":"...","transactions":[{"date":"YYYY-MM-DD","amount":-25.50,"description":"...","merchant":"...","location":"","category":"groceries","note":""}],"skipped":0}`;

/** Compact prompt for CSV/XLSX — adds parsingSchema instruction. */
const PROMPT_CSV = PROMPT_PDF + `

Se il file è CSV o XLSX aggiungi anche "parsingSchema": { "fileType": "csv"|"xlsx", "delimiter": ";"|","|"\\t", "skipRows": N, "dateCol": N, "dateFormat": "DD/MM/YYYY"|"YYYY-MM-DD", "amountCol": N|null, "creditCol": N|null, "debitCol": N|null, "descCol": N, "merchantCol": N|null, "decSep": ","|"." }`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function excelToCsv(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64 as any,
  });
  const wb = XLSX.read(base64, { type: 'base64' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(ws);
}

/** Normalizza date in formato ISO YYYY-MM-DD. Gestisce DD/MM/YYYY, DD-MM-YYYY, ecc. */
function normalizeDate(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return s;
}

/** Safety cap for single CSV/XLSX requests. */
const CSV_MAX_CHARS = 30_000;

// ── Streaming request ─────────────────────────────────────────────────────────

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

/**
 * Send one streaming request to Gemini and return the accumulated text.
 * Uses brace-depth scanning to extract text fields from the streaming JSON array.
 */
async function streamGeminiRequest(
  parts: GeminiPart[],
  logLabel: string,
  endpoint: string,
  timeoutMs = 120_000,
): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 65536,
    },
  });
  const modelName = endpoint.includes('lite') ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
  console.log(`[Gemini] → stream | ${logLabel} | ${modelName} | ${(body.length / 1024).toFixed(1)}KB`);

  const t0 = Date.now();

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${endpoint}?key=${GEMINI_API_KEY}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = timeoutMs;
    xhr.ontimeout = () => reject(new Error(`Gemini: timeout dopo ${timeoutMs / 1000} secondi.`));
    xhr.onerror = () => reject(new Error('Gemini: errore di rete. Verifica la connessione internet.'));

    let accText = '';
    let settled = false;
    let chunkCount = 0;
    let scanPos = 0, braceDepth = 0, inString = false, escapeNext = false, chunkStart = -1;

    const processNewBytes = () => {
      if (settled) return;
      const full = xhr.responseText;
      for (; scanPos < full.length; scanPos++) {
        const ch = full[scanPos];
        if (escapeNext) { escapeNext = false; continue; }
        if (ch === '\\' && inString) { escapeNext = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') { if (braceDepth === 0) chunkStart = scanPos; braceDepth++; }
        else if (ch === '}') {
          braceDepth--;
          if (braceDepth === 0 && chunkStart >= 0) {
            try {
              const c = JSON.parse(full.slice(chunkStart, scanPos + 1));
              const part = c.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
              if (part) chunkCount++;
              accText += part;
            } catch { /* skip malformed chunk */ }
            chunkStart = -1;
          }
        }
      }
    };

    xhr.onprogress = processNewBytes;
    xhr.onload = () => {
      if (settled) return;
      processNewBytes();
      if (xhr.status !== 200) {
        const errSnippet = xhr.responseText.slice(0, 300);
        console.error(`[Gemini] ✗ HTTP ${xhr.status}:`, errSnippet);
        if (xhr.status === 400) { reject(new Error('Gemini: richiesta non valida. Verifica la API key.')); return; }
        if (xhr.status === 429) { reject(new Error('Gemini: quota esaurita. Riprova tra qualche minuto.')); return; }
        reject(new Error(`Gemini API error ${xhr.status}: ${errSnippet.slice(0, 150)}`));
        return;
      }
      settled = true;
      console.log(`[Gemini] ← completato in ${Date.now() - t0}ms | chunks: ${chunkCount} | ${accText.length} chars`);
      resolve(accText);
    };
    xhr.send(body);
  });
}

// ── JSON response parser ──────────────────────────────────────────────────────

function parseGeminiJSON(rawText: string): {
  transactions: ParseResult['transactions'];
  bankName: string;
  skipped: number;
  parsingSchema?: import('./bankSchemaStore').BankParsingSchema;
} {
  if (!rawText) throw new Error('Gemini ha restituito una risposta vuota.');

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const m = rawText.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (m) parsed = JSON.parse(m[1]);
    else throw new Error('Risposta Gemini non è JSON valido.');
  }

  console.log(`[Gemini] transazioni: ${parsed.transactions?.length ?? 0} | banca: "${parsed.bankName}" | skipped: ${parsed.skipped ?? 0}`);

  const mapped = ((parsed.transactions ?? []) as any[]).map((t) => ({
    date: normalizeDate(t.date),
    amount: Number(t.amount) || 0,
    description: String(t.description || t.merchant || 'Transazione').slice(0, 80),
    merchant: t.merchant ? String(t.merchant).slice(0, 60) : undefined,
    location: t.location ? String(t.location).slice(0, 100) : undefined,
    category: (t.category as CategoryId) || 'other',
    note: String(t.note ?? ''),
  }));

  const transactions = mapped.filter((t) => {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.amount !== 0;
    if (!ok) console.warn('[Gemini] tx scartata:', JSON.stringify(t));
    return ok;
  });

  console.log(`[Gemini] dopo filtro: ${transactions.length}/${mapped.length} valide`);

  const rawSchema = parsed.parsingSchema;
  let parsingSchema: import('./bankSchemaStore').BankParsingSchema | undefined;
  if (rawSchema && rawSchema.fileType && rawSchema.fileType !== 'pdf') {
    parsingSchema = {
      bankName: String(parsed.bankName ?? 'Banca (Gemini AI)'),
      fileType: rawSchema.fileType,
      delimiter: rawSchema.delimiter ?? ';',
      skipRows: Number(rawSchema.skipRows ?? 0),
      dateCol: Number(rawSchema.dateCol ?? 0),
      dateFormat: String(rawSchema.dateFormat ?? 'DD/MM/YYYY'),
      amountCol: rawSchema.amountCol !== null && rawSchema.amountCol !== undefined ? Number(rawSchema.amountCol) : null,
      creditCol: rawSchema.creditCol !== null && rawSchema.creditCol !== undefined ? Number(rawSchema.creditCol) : null,
      debitCol: rawSchema.debitCol !== null && rawSchema.debitCol !== undefined ? Number(rawSchema.debitCol) : null,
      descCol: Number(rawSchema.descCol ?? 1),
      merchantCol: rawSchema.merchantCol !== null && rawSchema.merchantCol !== undefined ? Number(rawSchema.merchantCol) : null,
      decSep: rawSchema.decSep === '.' ? '.' : ',',
      savedAt: new Date().toISOString(),
    };
    console.log('[Gemini] schema estratto:', JSON.stringify(parsingSchema));
  }

  return {
    transactions,
    bankName: String(parsed.bankName ?? 'Banca (Gemini AI)'),
    skipped: Number(parsed.skipped ?? 0),
    parsingSchema,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function parseWithGemini(
  uri: string,
  fileName: string,
): Promise<ParseResult> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key non configurata. Aggiungi EXPO_PUBLIC_GEMINI_API_KEY nel file .env.');
  const name = fileName.toLowerCase();

  // ── PDF: send natively as base64 inline_data ──────────────────────────────
  if (name.endsWith('.pdf')) {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64 as any,
    });
    console.log(`[Gemini] PDF nativo | ${(base64.length * 0.75 / 1024).toFixed(0)}KB | modello: gemini-2.5-flash`);

    const parts: GeminiPart[] = [
      { text: PROMPT_PDF },
      { inline_data: { mime_type: 'application/pdf', data: base64 } },
    ];
    const label = `"${fileName}" | PDF nativo`;
    const rawText = await streamGeminiRequest(parts, label, GEMINI_ENDPOINT_FULL, 240_000);
    console.log('[Gemini] output grezzo (primi 200 chars):\n', rawText.slice(0, 200));
    const result = parseGeminiJSON(rawText);
    appendChunkLog(0, 1, `[PDF nativo ${(base64.length * 0.75 / 1024).toFixed(0)}KB]`, rawText, result.transactions.length);
    console.log('[Gemini] prime 3 transazioni:', JSON.stringify(result.transactions.slice(0, 3), null, 2));
    return result;
  }

  // ── Excel → CSV ───────────────────────────────────────────────────────────
  let fileContent: string;
  let fileType: string;

  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) {
    fileType = 'Excel → CSV';
    fileContent = await excelToCsv(uri);
  } else {
    fileType = 'CSV/TXT';
    fileContent = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  let truncationWarning: ParseResult['truncationWarning'];
  if (fileContent.length > CSV_MAX_CHARS) {
    const totalLines = fileContent.split('\n').length;
    const truncated = fileContent.slice(0, CSV_MAX_CHARS);
    const includedLines = truncated.split('\n').length;
    truncationWarning = {
      totalLines,
      includedLines,
      message: `File troppo grande: importate ${includedLines} di ${totalLines} righe`,
    };
    console.warn(`[Gemini] testo troncato da ${fileContent.length} a ${CSV_MAX_CHARS} caratteri`);
    fileContent = truncated;
  }

  console.log(`[Gemini] ${fileType} | ${fileContent.length} chars | modello: gemini-2.5-flash-lite`);
  const parts: GeminiPart[] = [
    { text: `${PROMPT_CSV}\n\n--- ESTRATTO CONTO ---\n${fileContent}` },
  ];
  const label = `"${fileName}" | ${fileType}`;
  const rawText = await streamGeminiRequest(parts, label, GEMINI_ENDPOINT_LITE);
  console.log('[Gemini] output grezzo:\n', rawText);
  const result = parseGeminiJSON(rawText);
  appendChunkLog(0, 1, fileContent, rawText, result.transactions.length);
  console.log('[Gemini] prime 3 transazioni:', JSON.stringify(result.transactions.slice(0, 3), null, 2));
  return { ...result, truncationWarning };
}
