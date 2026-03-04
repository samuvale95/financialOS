import type { CategoryId } from '../constants/categories';

// More specific rules must come before catch-all ones for the same domain
const RULES: [CategoryId, string[]][] = [
  ['salary',           ['stipendio', 'salario', 'busta paga', 'retribuzione', 'cedolino']],
  ['freelance',        ['freelance', 'consulenza', 'prestazione', 'parcella', 'fattura', 'cliente', 'progetto']],
  ['investment',       ['dividendo', 'cedola', 'interessi', 'rendimento', 'etf', 'azioni', 'borsa', 'trading']],
  ['subscriptions',    ['netflix', 'spotify', 'amazon prime', 'disney', 'apple one', 'apple music', 'dazn', 'sky', 'now tv', 'abbonamento', 'subscription']],
  ['utilities',        ['enel', 'a2a', 'eni gas', 'acea', 'hera', 'iren', 'tim', 'vodafone', 'iliad', 'wind', 'tre', 'fastweb', 'bolletta', 'luce', 'gas', 'acqua', 'internet', 'telefono']],
  ['insurance',        ['assicurazione', 'assicurazioni', 'polizza', 'generali', 'allianz', 'unipol', 'rca', 'infortuni', 'premio assicurativo']],
  ['travel',           ['airbnb', 'booking', 'ryanair', 'alitalia', 'ita airways', 'easyjet', 'blablacar', 'hotel', 'volo', 'aeroporto', 'vacanza', 'viaggio', 'agriturismo']],
  ['pharmacy',         ['farmacia', 'parafarmacia', 'farmaco', 'medicinale', 'farmaci']],
  ['health',           ['medico', 'dottore', 'dentista', 'ospedale', 'clinica', 'ottico', 'fisioterapia', 'wellness', 'analisi', 'visita', 'ambulatorio']],
  ['sports',           ['palestra', 'fitlife', 'virgin active', 'mcfit', 'decathlon', 'nike', 'adidas', 'puma', 'sport', 'fitness', 'swimming', 'piscina', 'calcio', 'tennis']],
  ['education',        ['udemy', 'coursera', 'libri', 'libreria', 'feltrinelli', 'mondadori', 'università', 'corso', 'scuola', 'master', 'formazione', 'amazon kindle']],
  ['fuel',             ['q8', 'eni carburante', 'agip', 'ip stazione', 'esso', 'shell', 'tamoil', 'total', 'carburante', 'benzina', 'gasolio', 'diesel', 'rifornimento']],
  ['public_transport', ['atm', 'atac', 'trenitalia', 'italo', 'frecciarossa', 'flixbus', 'autobus', 'metro', 'taxi', 'uber', 'bolt', 'free now', 'telepass', 'autostrada', 'bike sharing', 'monopattino']],
  ['groceries',        ['esselunga', 'coop', 'conad', 'lidl', 'aldi', 'carrefour', 'pam', 'spar', 'despar', 'iper', 'eurospin', 'supermercato', 'alimentari', 'tigros', 'bennet', 'famila', 'penny market', 'md discount']],
  ['restaurants',      ['ristorante', 'trattoria', 'osteria', 'pizzeria', 'sushi', 'bar ', 'caffè', 'caffe', 'mcdonalds', 'mcdonald', 'burger king', 'kfc', 'just eat', 'deliveroo', 'glovo', 'uber eats', 'takeaway', 'dominos']],
  ['food',             ['alimentari', 'gastronomia']],
  ['transport',        ['parcheggio', 'parking', 'autonoleggio', 'hertz', 'avis', 'europcar', 'rc auto']],
  ['rent',             ['affitto', 'mutuo', 'canone locazione', 'locazione', 'condominio']],
  ['home',             ['ikea', 'leroy merlin', 'casalinghi', 'arredamento', 'pulizie', 'riparazioni', 'elettrodomestici', 'obi']],
  ['shopping',         ['zara', 'h&m', 'hm', 'uniqlo', 'mango', 'primark', 'amazon', 'ebay', 'zalando', 'asos', 'fnac', 'mediaworld', 'unieuro', 'euronics', 'apple store', 'samsung']],
  ['entertainment',    ['cinema', 'teatro', 'concerto', 'museo', 'parco', 'bowling', 'escape room', 'eventi', 'biglietti', 'ticketmaster', 'ticketone', 'anteo', 'uci']],
];

export function categorize(description: string): CategoryId {
  const lower = description.toLowerCase();
  for (const [cat, keywords] of RULES) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return cat;
    }
  }
  return 'other';
}

/**
 * Returns a normalized merchant key for grouping transactions.
 * Uses the merchant field if available, otherwise normalizes the description
 * by stripping payment type prefixes, dates, and reference codes.
 */
export function getMerchantKey(tx: { merchant?: string; description: string }): string {
  // Prefer the parsed merchant field when it exists and differs from description
  if (tx.merchant && tx.merchant.trim().length > 2 && tx.merchant !== tx.description) {
    return tx.merchant.trim().toLowerCase().slice(0, 60);
  }
  let key = tx.description;
  // Strip leading payment-type prefixes common in Italian banking
  key = key.replace(
    /^(PAGAMENTO\s+(POS\s*\*?\s*\d*|SEPA\s+)?|BONIFICO\s+(SEPA\s+)?|ACCREDITO\s+(STIPENDIO\s+)?|ADDEBITO\s+(SDD\s+|PREAUTORIZZATO\s+)?|PRELIEVO\s+(BANCOMAT\s+)?|COMMISSIONI?\s+|RID\s+|MAV\s+|RAV\s+|VB\s+)/i,
    ''
  );
  // Strip date patterns: 01/01, 12/01/25, 15-01-2025
  key = key.replace(/\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b/g, '');
  // Strip pure numeric reference codes (8+ digits)
  key = key.replace(/\b\d{8,}\b/g, '');
  // Normalize
  key = key.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 60);
  return key || tx.description.toLowerCase().slice(0, 60);
}
