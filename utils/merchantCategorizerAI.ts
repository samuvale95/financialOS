/**
 * Categorizzazione AI selettiva: invia all'LLM solo i merchant non riconosciuti
 * dal categorizer locale (categoria = 'other'). Payload ~10-50x più piccolo
 * rispetto al testo completo del file.
 */
import type { CategoryId } from '../constants/categories';
import type { ParseResult } from './parsers';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

const CATEGORY_IDS = [
  'groceries','restaurants','food','fuel','public_transport','transport',
  'shopping','entertainment','sports','health','pharmacy','home','rent',
  'utilities','insurance','subscriptions','travel','education','beauty',
  'pets','taxes','salary','freelance','investment','transfer','other',
] as const;

const SYSTEM_PROMPT = `Sei un categorizzatore di transazioni bancarie italiane.
Ti viene fornita una lista di descrizioni/merchant non riconosciute.
Rispondi con un JSON compatto: { "descrizione_originale": "category_id", ... }

Categorie disponibili: ${CATEGORY_IDS.join(', ')}

Regole:
- Usa "salary" per stipendi/accrediti datore lavoro
- Usa "transfer" per giroconti tra propri conti
- Usa "other" solo se sei davvero incerto
- NON aggiungere testo fuori dal JSON`;

async function callOpenAI(descriptions: string[]): Promise<Record<string, CategoryId>> {
  const body = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(descriptions) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 1024,
    stream: true,
  });

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', OPENAI_ENDPOINT);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${OPENAI_API_KEY}`);
    xhr.timeout = 30_000;

    let lastLength = 0;
    let accContent = '';
    let lineBuffer = '';
    let settled = false;

    const parse = () => {
      lineBuffer += xhr.responseText.slice(lastLength);
      lastLength = xhr.responseText.length;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') { settled = true; resolve(safeParseCategories(accContent)); return; }
        try { accContent += JSON.parse(data).choices?.[0]?.delta?.content ?? ''; } catch { /* skip */ }
      }
    };

    xhr.onprogress = parse;
    xhr.onload = () => { if (settled) return; parse(); resolve(safeParseCategories(accContent)); };
    xhr.ontimeout = () => resolve({});
    xhr.onerror = () => resolve({});
    xhr.send(body);
  });
}

async function callGemini(descriptions: string[]): Promise<Record<string, CategoryId>> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${JSON.stringify(descriptions)}` }] }],
    generationConfig: { response_mime_type: 'application/json', temperature: 0, maxOutputTokens: 1024 },
  });

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 30_000;

    let accText = '';
    let scanPos = 0, braceDepth = 0, inString = false, escapeNext = false, chunkStart = -1;
    let settled = false;

    const scan = () => {
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
            try { accText += JSON.parse(full.slice(chunkStart, scanPos + 1)).candidates?.[0]?.content?.parts?.[0]?.text ?? ''; } catch { /* skip */ }
            chunkStart = -1;
          }
        }
      }
    };

    xhr.onprogress = scan;
    xhr.onload = () => { if (settled) return; scan(); settled = true; resolve(safeParseCategories(accText)); };
    xhr.ontimeout = () => resolve({});
    xhr.onerror = () => resolve({});
    xhr.send(body);
  });
}

function safeParseCategories(raw: string): Record<string, CategoryId> {
  try {
    const parsed = JSON.parse(raw);
    const result: Record<string, CategoryId> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && CATEGORY_IDS.includes(val as CategoryId)) {
        result[key] = val as CategoryId;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Arricchisce con AI le transazioni che il categorizer locale ha marcato come 'other'.
 * Invia solo le descrizioni uniche non riconosciute → payload minimo.
 */
export async function enrichCategories(
  result: ParseResult,
  provider: 'openai' | 'gemini',
): Promise<ParseResult> {
  const unknownDescs = [
    ...new Set(
      result.transactions
        .filter(t => t.category === 'other')
        .map(t => t.description),
    ),
  ];

  if (unknownDescs.length === 0) {
    console.log('[CatAI] tutte le categorie già riconosciute localmente, nessuna chiamata AI');
    return result;
  }

  console.log(`[CatAI] ${unknownDescs.length} merchant sconosciuti → AI`);
  console.log('[CatAI] payload:', JSON.stringify(unknownDescs));

  const mapping =
    provider === 'openai' && OPENAI_API_KEY
      ? await callOpenAI(unknownDescs)
      : GEMINI_API_KEY
        ? await callGemini(unknownDescs)
        : {};

  console.log('[CatAI] mapping ricevuto:', JSON.stringify(mapping));

  if (Object.keys(mapping).length === 0) return result;

  const enriched = result.transactions.map(t => {
    if (t.category !== 'other') return t;
    const suggested = mapping[t.description];
    return suggested ? { ...t, category: suggested } : t;
  });

  const improved = enriched.filter(t => t.category !== 'other').length
    - result.transactions.filter(t => t.category !== 'other').length;
  console.log(`[CatAI] ${improved} transazioni riclassificate`);

  return { ...result, transactions: enriched };
}
