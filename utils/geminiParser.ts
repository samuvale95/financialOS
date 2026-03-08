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
import type { ParseResult } from './parsers';
import type { CategoryId } from '../constants/categories';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

/** True when the app has a Gemini key baked in — use to gate AI parsing. */
export const hasGemini = Boolean(GEMINI_API_KEY);

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

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, nessun testo prima o dopo:
{
  "bankName": "nome della banca rilevata dal documento",
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

// ── Public API ────────────────────────────────────────────────────────────────

export async function parseWithGemini(
  uri: string,
  fileName: string,
): Promise<ParseResult> {
  const apiKey = GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key non configurata. Aggiungi EXPO_PUBLIC_GEMINI_API_KEY nel file .env.');
  const name = fileName.toLowerCase();

  let parts: object[];

  if (name.endsWith('.pdf')) {
    // PDF: Gemini reads it natively from base64 inline_data
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64 as any,
    });
    parts = [
      { text: PROMPT },
      { inline_data: { mime_type: 'application/pdf', data: base64 } },
    ];
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) {
    // Excel: convert to CSV first, then send as text
    const csv = await excelToCsv(uri);
    parts = [{ text: `${PROMPT}\n\n--- CONTENUTO FILE (CSV) ---\n${csv}` }];
  } else {
    // CSV / TXT: raw text
    const text = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    parts = [{ text: `${PROMPT}\n\n--- CONTENUTO FILE ---\n${text}` }];
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 65536,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 400) throw new Error('Gemini: richiesta non valida. Verifica la API key.');
    if (response.status === 429) throw new Error('Gemini: quota esaurita. Riprova tra qualche minuto.');
    throw new Error(`Gemini API error ${response.status}: ${body.slice(0, 150)}`);
  }

  const data = await response.json();
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!rawText) throw new Error('Gemini ha restituito una risposta vuota.');

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Attempt to extract JSON from fenced code block
    const m = rawText.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (m) parsed = JSON.parse(m[1]);
    else throw new Error('Risposta Gemini non è JSON valido.');
  }

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

  return {
    transactions,
    bankName: String(parsed.bankName ?? 'Banca (Gemini AI)'),
    skipped: Number(parsed.skipped ?? 0),
  };
}
