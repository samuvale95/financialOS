/**
 * Gemini Flash parser for bank statements.
 *
 * Uses Google Gemini 2.0 Flash to parse and categorise transactions from any
 * file format:
 *   - PDF  → sent as base64 inline_data (Gemini reads it natively)
 *   - XLSX → converted to CSV via SheetJS, then sent as text
 *   - CSV / TXT → sent as raw text
 *
 * Requires a Gemini API key from https://aistudio.google.com/app/apikey
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { extractTextFromPDF } from './pdfParser';
import { appendChunkLog } from './importLogger';
import type { ParseResult } from './parsers';
import type { CategoryId } from '../constants/categories';

// streamGenerateContent keeps the connection alive via continuous chunks,
// preventing iOS/Expo Go from dropping long-running requests.
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

/** True when the app has a Gemini key baked in — use to gate AI parsing. */
export const hasGemini = Boolean(GEMINI_API_KEY);

// Diagnostic: printed once when the module loads
console.log('[Gemini] modulo caricato | EXPO_PUBLIC_GEMINI_API_KEY presente:', Boolean(GEMINI_API_KEY), '| hasGemini:', hasGemini);

// ── Category reference for the prompt ────────────────────────────────────────

const CATEGORY_GUIDE = `
CATEGORIE (usa l'ID esatto nella colonna "category"):
- groceries    → Supermercato, grande distribuzione (Esselunga, Carrefour, Conad, Lidl, Coop, Pam, Tigros, Aldi, Penny, Bennet, Iper)
- restaurants  → Ristoranti, bar, caffè, pizzerie, fast food, takeaway (McDonald's, Burger King, Starbucks, Spontini, Camst, Autogrill)
- food         → Alimentari, gastronomie, panetterie, mercati, fruttivendoli
- fuel         → Carburante, stazioni di servizio (Eni, Q8, TotalEnergies, IP, Tamoil, Shell)
- public_transport → Trasporti pubblici (ATM, Trenitalia, Frecciarossa, Italo, Flixbus, autobus, metro, tram, taxi collettivo, Trenord, Circumvesuviana)
- transport    → Taxi, Uber, FREE NOW, noleggio auto, parcheggi, ZTL, pedaggi autostrada, Telepass
- shopping     → Abbigliamento, scarpe, elettronica, Amazon, Zara, H&M, Uniqlo, IKEA, MediaWorld, Euronics, Decathlon, OVS, Calzedonia, Coin
- entertainment → Cinema, concerti, eventi, Ticketmaster, TicketOne, Playstation, Xbox, videogiochi, musei, mostre
- sports       → Palestra, abbonamento fitness, sport, yoga, pilates, nuoto, running, Virgin Active, Technogym, Tiger Fitness
- health       → Medico, visite specialistiche, cliniche, dentista, ottico (es. Salmoiraghi, Avanzi)
- pharmacy     → Farmacie (es. Lloyds, Dr. Max), parafarmacie, prodotti sanitari OTC
- home         → Arredamento, elettrodomestici, riparazioni, bricolage, Leroy Merlin, Bricoman, Obi
- rent         → Affitto mensile, mutuo, canone locazione
- utilities    → Bollette luce, gas, acqua, internet, telefono (Enel, A2A, Hera, Vodafone, TIM, WindTre, Fastweb, Illiad)
- insurance    → Assicurazioni RC auto, vita, casa, sanitaria (AXA, Generali, UnipolSai, Allianz, Zurich, Filo Diretto)
- subscriptions → Abbonamenti digitali ricorrenti (Netflix, Spotify, Amazon Prime, Disney+, DAZN, Apple, Google, Microsoft 365, iCloud, Dropbox, ChatGPT, Adobe)
- travel       → Voli, hotel, B&B, Booking.com, Airbnb, Ryanair, EasyJet, Alitalia, ITA Airways, Trenitalia tratte lunga percorrenza
- education    → Corsi online, libri, università, scuole, formazione, Udemy, Coursera, Skillshare
- beauty       → Parrucchiere, estetista, centri benessere, cosmetica, profumerie (Douglas, Sephora, Kiko)
- pets         → Veterinario, petshop, cibo animali, toelettatura, Arcaplanet, Isola dei Tesori
- taxes        → Tasse, imposte, F24, contributi INPS, bollo auto, OMR, Agenzia Entrate
- salary       → Stipendio, accredito mensile datore di lavoro, tredicesima, quattordicesima
- freelance    → Pagamenti clienti, compensi professionali, fatture ricevute, parcelle
- investment   → ETF, azioni, criptovalute, fondi comuni, dividendi, Directa, Fineco trading, Degiro
- transfer     → Giroconto interno tra propri conti dello stesso intestatario, bonifico a se stessi
- other        → Tutto ciò che non rientra in nessuna categoria sopra`.trim();

// ── Prompt ────────────────────────────────────────────────────────────────────

const PROMPT = `Sei un esperto analista di estratti conto bancari italiani. Il tuo compito è estrarre TUTTE le transazioni presenti nel documento e classificarle nelle categorie corrette.

REGOLE:
1. Estrai ogni singola transazione (non perderne nessuna).
2. amount: NEGATIVO per uscite/addebiti/pagamenti, POSITIVO per entrate/accrediti/stipendi/rimborsi/storni.
3. date: formato ISO YYYY-MM-DD. Se l'anno non è indicato esplicitamente, deducilo dal contesto del documento.
4. description: breve, leggibile, in italiano, Title Case, max 60 caratteri (es. "Esselunga Via Dante", "Netflix Abbonamento", "Stipendio Marzo").
5. merchant: solo il nome del brand/esercente, senza indirizzo, senza suffissi legali (Spa, Srl, ecc.). Title Case. Stringa vuota se non applicabile (es. accrediti stipendio, giroconti).
6. location: solo se è un pagamento fisico con indirizzo visibile (es. "Via Dante 14, Milano"). Altrimenti stringa vuota.
7. category: usa ESATTAMENTE uno degli ID sotto. Se sei molto incerto usa "other".
8. note: qualsiasi informazione utile extra (es. "Carta **** 1234", "Rif. fattura F-2025-001"). Stringa vuota se non c'è nulla.

${CATEGORY_GUIDE}

9. Se il file è CSV o Excel (NON PDF), aggiungi anche "parsingSchema" per permettere il parsing locale in futuro senza AI:
   - fileType: "csv" o "xlsx"
   - delimiter: carattere separatore CSV (";", ",", "\t")
   - skipRows: numero di righe di intestazione da saltare prima dei dati
   - dateCol: indice colonna data (0-based)
   - dateFormat: formato data ("DD/MM/YYYY", "YYYY-MM-DD", ecc.)
   - amountCol: indice colonna importo unificato (null se separato in credito/debito)
   - creditCol: indice colonna entrate (null se non esiste)
   - debitCol: indice colonna uscite con importo positivo (null se non esiste)
   - descCol: indice colonna descrizione/causale
   - merchantCol: indice colonna merchant (null se non esiste)
   - decSep: separatore decimale ("," o ".")

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, nessun testo prima o dopo:
{
  "bankName": "nome della banca rilevata dal documento",
  "parsingSchema": { "fileType": "csv", "delimiter": ";", "skipRows": 7, "dateCol": 0, "dateFormat": "DD/MM/YYYY", "amountCol": null, "creditCol": 3, "debitCol": 4, "descCol": 1, "merchantCol": null, "decSep": "," },
  "transactions": [
    { "date": "YYYY-MM-DD", "amount": -25.50, "description": "Esselunga Via Dante", "merchant": "Esselunga", "location": "Via Dante 14, Milano", "category": "groceries", "note": "" }
  ],
  "skipped": 0
}`;

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

// ── Chunking helpers ──────────────────────────────────────────────────────────

/** Max chars per PDF chunk (conservative to stay well within Gemini context + avoid timeout). */
const PDF_CHUNK_CHARS = 18_000;
/** Safety cap for single CSV/XLSX requests. */
const CSV_MAX_CHARS = 30_000;

/** Split PDF text at page boundaries into chunks fitting within maxChars. */
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
 * Send one streaming request to Gemini and return the accumulated text.
 * Uses brace-depth scanning to extract text fields from the streaming JSON array.
 * Extracted so it can be called once per PDF chunk.
 */
async function streamGeminiRequest(textContent: string, logLabel: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: `${PROMPT}\n\n--- ESTRATTO CONTO ---\n${textContent}` }] }],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 65536,
    },
  });
  console.log(`[Gemini] → stream | ${logLabel} | ${(body.length / 1024).toFixed(1)}KB`);

  const TIMEOUT_MS = 120_000;
  const t0 = Date.now();

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = TIMEOUT_MS;
    xhr.ontimeout = () => reject(new Error(`Gemini: timeout dopo ${TIMEOUT_MS / 1000} secondi.`));
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

function parseGeminiJSON(rawText: string): ChunkResult {
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

  let fileContent: string;
  let fileType: string;

  if (name.endsWith('.pdf')) {
    fileType = 'PDF (testo estratto)';
    fileContent = await extractTextFromPDF(uri);
    console.log(`[Gemini] testo estratto PDF (${fileContent.length} chars):\n`, fileContent.slice(0, 500));
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) {
    fileType = 'Excel → CSV';
    fileContent = await excelToCsv(uri);
  } else {
    fileType = 'CSV/TXT';
    fileContent = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  console.log(`[Gemini] testo file: ${fileContent.length} caratteri | tipo: ${fileType} | modello: gemini-2.5-flash`);

  // ── PDF: chunked if text exceeds per-chunk limit ──────────────────────────
  if (name.endsWith('.pdf') && fileContent.length > PDF_CHUNK_CHARS) {
    const chunks = buildPageChunks(fileContent, PDF_CHUNK_CHARS);
    console.log(`[Gemini] PDF lungo → ${chunks.length} chunk (${chunks.map((c) => c.length).join(' + ')} chars)`);

    const chunkResults: ChunkResult[] = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const partNote = chunks.length > 1
        ? `PARTE ${ci + 1} DI ${chunks.length} — estrai SOLO le transazioni presenti in questo blocco.\n\n`
        : '';
      const label = `"${fileName}" chunk ${ci + 1}/${chunks.length}`;
      const rawText = await streamGeminiRequest(partNote + chunks[ci], label);
      console.log(`[Gemini] chunk ${ci + 1} output (primi 200 chars):`, rawText.slice(0, 200));
      const chunkResult = parseGeminiJSON(rawText);
      appendChunkLog(ci, chunks.length, chunks[ci], rawText, chunkResult.transactions.length);
      chunkResults.push(chunkResult);
    }

    const merged = mergeChunkResults(chunkResults, 'Banca (Gemini AI)');
    console.log(`[Gemini] merge finale: ${merged.transactions.length} transazioni | banca: "${merged.bankName}"`);
    return merged;
  }

  // ── CSV / XLSX / short PDF: single request ────────────────────────────────
  if (fileContent.length > CSV_MAX_CHARS) {
    console.warn(`[Gemini] testo troncato da ${fileContent.length} a ${CSV_MAX_CHARS} caratteri`);
    fileContent = fileContent.slice(0, CSV_MAX_CHARS);
  }

  const label = `"${fileName}" | ${fileType}`;
  const rawText = await streamGeminiRequest(fileContent, label);
  console.log('[Gemini] output grezzo:\n', rawText);
  const result = parseGeminiJSON(rawText);
  appendChunkLog(0, 1, fileContent, rawText, result.transactions.length);
  console.log('[Gemini] prime 3 transazioni:', JSON.stringify(result.transactions.slice(0, 3), null, 2));
  return result;
}
