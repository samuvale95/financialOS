/**
 * OpenAI GPT-4o-mini parser for bank statements.
 * Extracts and categorises transactions from PDF, Excel or CSV files.
 *
 * PDF  → text extracted via pdfjs (cheap — no binary upload)
 * XLSX → converted to CSV via SheetJS
 * CSV  → raw text
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { extractTextFromPDF } from './pdfParser';
import { appendChunkLog } from './importLogger';
import type { ParseResult } from './parsers';
import type { CategoryId } from '../constants/categories';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

export const hasOpenAI = Boolean(OPENAI_API_KEY);

console.log('[OpenAI] modulo caricato | EXPO_PUBLIC_OPENAI_API_KEY presente:', Boolean(OPENAI_API_KEY), '| hasOpenAI:', hasOpenAI);

// ── Shared prompt ─────────────────────────────────────────────────────────────

const CATEGORY_GUIDE = `
CATEGORIE (usa l'ID esatto nella colonna "category"):
- groceries    → Supermercato, grande distribuzione (Esselunga, Carrefour, Conad, Lidl, Coop, Pam, Tigros, Aldi, Penny, Bennet, Iper)
- restaurants  → Ristoranti, bar, caffè, pizzerie, fast food, takeaway (McDonald's, Burger King, Starbucks, Spontini, Camst, Autogrill)
- food         → Alimentari, gastronomie, panetterie, mercati, fruttivendoli
- fuel         → Carburante, stazioni di servizio (Eni, Q8, TotalEnergies, IP, Tamoil, Shell)
- public_transport → Trasporti pubblici (ATM, Trenitalia, Frecciarossa, Italo, Flixbus, autobus, metro, tram, Trenord)
- transport    → Taxi, Uber, FREE NOW, noleggio auto, parcheggi, ZTL, pedaggi autostrada, Telepass
- shopping     → Abbigliamento, scarpe, elettronica, Amazon, Zara, H&M, Uniqlo, IKEA, MediaWorld, Euronics, Decathlon, OVS
- entertainment → Cinema, concerti, eventi, Ticketmaster, TicketOne, Playstation, Xbox, videogiochi, musei
- sports       → Palestra, abbonamento fitness, sport, yoga, pilates, nuoto, running, Virgin Active
- health       → Medico, visite specialistiche, cliniche, dentista, ottico (Salmoiraghi, Avanzi)
- pharmacy     → Farmacie (Lloyds, Dr. Max), parafarmacie, prodotti sanitari OTC
- home         → Arredamento, elettrodomestici, riparazioni, bricolage, Leroy Merlin, Bricoman, Obi
- rent         → Affitto mensile, mutuo, canone locazione
- utilities    → Bollette luce, gas, acqua, internet, telefono (Enel, A2A, Hera, Vodafone, TIM, WindTre, Fastweb, Illiad)
- insurance    → Assicurazioni RC auto, vita, casa, sanitaria (AXA, Generali, UnipolSai, Allianz, Zurich)
- subscriptions → Abbonamenti digitali ricorrenti (Netflix, Spotify, Amazon Prime, Disney+, DAZN, Apple, Google, Microsoft 365, iCloud, Adobe)
- travel       → Voli, hotel, B&B, Booking.com, Airbnb, Ryanair, EasyJet, ITA Airways
- education    → Corsi online, libri, università, scuole, formazione, Udemy, Coursera
- beauty       → Parrucchiere, estetista, centri benessere, cosmetica, profumerie (Douglas, Sephora, Kiko)
- pets         → Veterinario, petshop, cibo animali, toelettatura, Arcaplanet, Isola dei Tesori
- taxes        → Tasse, imposte, F24, contributi INPS, bollo auto, Agenzia Entrate
- salary       → Stipendio, accredito mensile datore di lavoro, tredicesima, quattordicesima
- freelance    → Pagamenti clienti, compensi professionali, fatture ricevute, parcelle
- investment   → ETF, azioni, criptovalute, fondi comuni, dividendi, Directa, Fineco trading, Degiro
- transfer     → Giroconto interno tra propri conti dello stesso intestatario, bonifico a se stessi
- other        → Tutto ciò che non rientra in nessuna categoria sopra`.trim();

const SYSTEM_PROMPT = `Sei un esperto analista di estratti conto bancari italiani. Estrai TUTTE le transazioni e classificale.

REGOLE:
1. Estrai OGNI singola transazione senza eccezioni.
2. amount: NEGATIVO per uscite/addebiti/pagamenti, POSITIVO per entrate/accrediti/stipendi/rimborsi/storni.
3. date: formato ISO YYYY-MM-DD. Deduci l'anno dal contesto se non esplicito.
4. description: breve, leggibile, Title Case, max 60 caratteri.
5. merchant: solo nome del brand, senza indirizzo né suffissi legali (Spa, Srl). Title Case. Vuoto per accrediti/giroconti.
6. location: solo se pagamento fisico con indirizzo visibile (es. "Via Dante 14, Milano"). Altrimenti "".
7. category: usa ESATTAMENTE uno degli ID elencati. In caso di dubbio usa "other".
8. note: info utili extra (es. numero carta, riferimento). Vuoto se non c'è nulla.

${CATEGORY_GUIDE}

9. Se il file è CSV o Excel (NON PDF), aggiungi "parsingSchema": {"fileType":"csv","delimiter":";","skipRows":7,"dateCol":0,"dateFormat":"DD/MM/YYYY","amountCol":null,"creditCol":3,"debitCol":4,"descCol":1,"merchantCol":null,"decSep":","} — permette parsing locale futuro senza AI.

Rispondi con JSON compatto (senza spazi extra) con questa struttura:
{"bankName":"...","parsingSchema":{"fileType":"csv","delimiter":";","skipRows":7,"dateCol":0,"dateFormat":"DD/MM/YYYY","amountCol":null,"creditCol":3,"debitCol":4,"descCol":1,"merchantCol":null,"decSep":","},"transactions":[{"date":"YYYY-MM-DD","amount":-25.50,"description":"...","merchant":"...","location":"...","category":"groceries","note":""}],"skipped":0}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function excelToCsv(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64 as any,
  });
  const wb = XLSX.read(base64, { type: 'base64' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(ws);
}

// ── Chunking helpers ──────────────────────────────────────────────────────────

/** Max chars per chunk for PDFs — leaves room for the system prompt (~3 KB). */
const PDF_CHUNK_CHARS = 28_000;
/** Max chars for a single CSV/XLSX request (no chunking, just a safety cap). */
const CSV_MAX_CHARS = 40_000;

/**
 * Split PDF text (pages separated by `\n--- PAGINA ---\n`) into chunks
 * that each fit within `maxChars`. Splits only at page boundaries so
 * transactions are never cut mid-line.
 */
function buildPageChunks(fullText: string, maxChars: number): string[] {
  const pages = fullText.split('\n--- PAGINA ---\n');
  const chunks: string[] = [];
  let current = '';
  for (const page of pages) {
    const sep = current ? '\n--- PAGINA ---\n' : '';
    const candidate = current + sep + page;
    if (current && candidate.length > maxChars) {
      chunks.push(current);
      current = page;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [fullText];
}

interface ChunkResult {
  transactions: ParseResult['transactions'];
  bankName: string;
  skipped: number;
  parsingSchema?: import('./bankSchemaStore').BankParsingSchema;
}

/** Merge multiple chunk results: deduplicate transactions and pick best bankName. */
function mergeChunkResults(results: ChunkResult[], fallbackBankName: string): ChunkResult {
  const seen = new Set<string>();
  const allTx: ParseResult['transactions'] = [];
  let bankName = fallbackBankName;
  let totalSkipped = 0;
  let parsingSchema: import('./bankSchemaStore').BankParsingSchema | undefined;

  for (const r of results) {
    if (r.bankName && r.bankName !== fallbackBankName) bankName = r.bankName;
    if (!parsingSchema && r.parsingSchema) parsingSchema = r.parsingSchema;
    totalSkipped += r.skipped;
    for (const tx of r.transactions) {
      const k = `${tx.date}|${tx.amount}|${tx.description.slice(0, 30)}`;
      if (!seen.has(k)) { seen.add(k); allTx.push(tx); }
    }
  }
  allTx.sort((a, b) => b.date.localeCompare(a.date));
  return { transactions: allTx, bankName, skipped: totalSkipped, parsingSchema };
}

// ── Streaming request ─────────────────────────────────────────────────────────

/**
 * Send a single streaming request to the OpenAI API and return the accumulated
 * JSON content string. Extracted so it can be called once per PDF chunk.
 */
async function streamOpenAIRequest(userMessage: string, logLabel: string): Promise<string> {
  const bodyObj = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 16384,
    stream: true,
  };
  const body = JSON.stringify(bodyObj);
  console.log(`[OpenAI] → stream | ${logLabel} | ${(body.length / 1024).toFixed(1)}KB`);

  const TIMEOUT_MS = 120_000;
  const t0 = Date.now();

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', OPENAI_ENDPOINT);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${OPENAI_API_KEY}`);
    xhr.timeout = TIMEOUT_MS;
    xhr.ontimeout = () => reject(new Error(`OpenAI: timeout dopo ${TIMEOUT_MS / 1000} secondi.`));
    xhr.onerror = () => reject(new Error('OpenAI: errore di rete. Verifica la connessione internet.'));

    let lastLength = 0;
    let accContent = '';
    let settled = false;
    let lineBuffer = '';

    const parseSSEChunk = () => {
      if (settled) return;
      lineBuffer += xhr.responseText.slice(lastLength);
      lastLength = xhr.responseText.length;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          settled = true;
          console.log(`[OpenAI] ← completato in ${Date.now() - t0}ms | ${accContent.length} chars`);
          resolve(accContent);
          return;
        }
        try {
          const chunk = JSON.parse(data);
          if (chunk.error) { settled = true; reject(new Error(`OpenAI: ${chunk.error.message ?? 'errore API'}`)); return; }
          accContent += chunk.choices?.[0]?.delta?.content ?? '';
        } catch { /* skip malformed SSE lines */ }
      }
    };

    xhr.onprogress = parseSSEChunk;
    xhr.onload = () => {
      if (settled) return;
      parseSSEChunk();
      if (settled) return;
      if (xhr.status !== 200) {
        const errText = xhr.responseText.slice(0, 300);
        console.error(`[OpenAI] ✗ HTTP ${xhr.status}:`, errText);
        if (xhr.status === 401) { reject(new Error('OpenAI: API key non valida.')); return; }
        if (xhr.status === 429) { reject(new Error('OpenAI: quota esaurita. Riprova tra qualche minuto.')); return; }
        reject(new Error(`OpenAI API error ${xhr.status}: ${errText.slice(0, 150)}`));
        return;
      }
      settled = true;
      resolve(accContent);
    };
    xhr.send(body);
  });
}

// ── JSON response parser ──────────────────────────────────────────────────────

function parseOpenAIJSON(rawText: string): ChunkResult {
  if (!rawText) throw new Error('OpenAI ha restituito una risposta vuota.');

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const m = rawText.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (m) parsed = JSON.parse(m[1]);
    else throw new Error('Risposta OpenAI non è JSON valido.');
  }

  console.log(`[OpenAI] transazioni estratte: ${parsed.transactions?.length ?? 0} | banca: "${parsed.bankName}" | skipped: ${parsed.skipped ?? 0}`);

  const transactions = ((parsed.transactions ?? []) as any[])
    .map((t) => ({
      date: String(t.date ?? '').slice(0, 10),
      amount: Number(t.amount) || 0,
      description: String(t.description || t.merchant || 'Transazione').slice(0, 80),
      merchant: t.merchant ? String(t.merchant).slice(0, 60) : undefined,
      location: t.location ? String(t.location).slice(0, 100) : undefined,
      category: (t.category as CategoryId) || 'other',
      note: String(t.note ?? ''),
    }))
    .filter((t) => t.amount !== 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date));

  const rawSchema = parsed.parsingSchema;
  let parsingSchema: import('./bankSchemaStore').BankParsingSchema | undefined;
  if (rawSchema && rawSchema.fileType && rawSchema.fileType !== 'pdf') {
    parsingSchema = {
      bankName: String(parsed.bankName ?? 'Banca (OpenAI)'),
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
    console.log('[OpenAI] schema di parsing estratto:', JSON.stringify(parsingSchema));
  }

  return {
    transactions,
    bankName: String(parsed.bankName ?? 'Banca (OpenAI)'),
    skipped: Number(parsed.skipped ?? 0),
    parsingSchema,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function parseWithOpenAI(
  uri: string,
  fileName: string,
): Promise<ParseResult> {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key non configurata. Aggiungi EXPO_PUBLIC_OPENAI_API_KEY nel file .env.');

  const name = fileName.toLowerCase();
  let fileContent: string;
  let fileType: string;

  if (name.endsWith('.pdf')) {
    fileType = 'PDF (testo estratto)';
    fileContent = await extractTextFromPDF(uri);
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) {
    fileType = 'Excel → CSV';
    fileContent = await excelToCsv(uri);
  } else {
    fileType = 'CSV/TXT';
    fileContent = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  console.log(`[OpenAI] testo file: ${fileContent.length} caratteri | tipo: ${fileType} | modello: ${MODEL}`);

  // ── PDF: chunked if text exceeds per-chunk limit ──────────────────────────
  if (name.endsWith('.pdf') && fileContent.length > PDF_CHUNK_CHARS) {
    const chunks = buildPageChunks(fileContent, PDF_CHUNK_CHARS);
    console.log(`[OpenAI] PDF lungo → ${chunks.length} chunk (${chunks.map((c) => c.length).join(' + ')} chars)`);

    const chunkResults: ChunkResult[] = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const partNote = chunks.length > 1
        ? `PARTE ${ci + 1} DI ${chunks.length} — estrai SOLO le transazioni presenti in questo blocco.\n\n`
        : '';
      const userMessage = `${partNote}--- ESTRATTO CONTO ---\n${chunks[ci]}`;
      const label = `"${fileName}" chunk ${ci + 1}/${chunks.length}`;
      const rawText = await streamOpenAIRequest(userMessage, label);
      console.log(`[OpenAI] chunk ${ci + 1} output (primi 200 chars):`, rawText.slice(0, 200));
      const chunkResult = parseOpenAIJSON(rawText);
      appendChunkLog(ci, chunks.length, chunks[ci], rawText, chunkResult.transactions.length);
      chunkResults.push(chunkResult);
    }

    const merged = mergeChunkResults(chunkResults, 'Banca (OpenAI)');
    console.log(`[OpenAI] merge finale: ${merged.transactions.length} transazioni | banca: "${merged.bankName}"`);
    return merged;
  }

  // ── CSV / XLSX / short PDF: single request ────────────────────────────────
  if (fileContent.length > CSV_MAX_CHARS) {
    console.warn(`[OpenAI] testo troncato da ${fileContent.length} a ${CSV_MAX_CHARS} caratteri`);
    fileContent = fileContent.slice(0, CSV_MAX_CHARS);
  }

  const userMessage = `--- ESTRATTO CONTO ---\n${fileContent}`;
  const label = `"${fileName}" | ${fileType}`;
  const rawText = await streamOpenAIRequest(userMessage, label);
  console.log('[OpenAI] output grezzo:\n', rawText);
  const result = parseOpenAIJSON(rawText);
  appendChunkLog(0, 1, fileContent, rawText, result.transactions.length);
  console.log('[OpenAI] prime 3 transazioni:', JSON.stringify(result.transactions.slice(0, 3), null, 2));
  return result;
}
