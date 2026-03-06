import type { CategoryId } from '../constants/categories';

// More specific rules must come before catch-all ones for the same domain
const RULES: [CategoryId, string[]][] = [
  ['transfer', [
    'giroconto', 'giro conto', 'trasferimento tra conti', 'bonifico a me stesso',
    'revolut top-up', 'transfer to revolut', 'n26 transfer', 'top up revolut',
    'ricarica conto', 'ricarica prepagata', 'satispay top up', 'hype top up',
    'ricarica hype', 'ricarica satispay',
  ]],
  ['salary', [
    'stipendio', 'salario', 'busta paga', 'retribuzione', 'cedolino',
    'tredicesima', 'quattordicesima', 'arretrati stipendio',
  ]],
  ['freelance', [
    'freelance', 'consulenza', 'prestazione professionale', 'parcella',
    'onorario', 'compenso', 'incasso fattura', 'fattura', 'cliente',
  ]],
  ['investment', [
    'dividendo', 'cedola', 'interessi attivi', 'etf', 'azioni', 'fineco',
    'directa', 'degiro', 'scalable', 'moneyfarm', 'btp', 'borsa', 'trading',
    'rendimento', 'interessi', 'conto deposito',
  ]],
  ['taxes', [
    'f24', 'imu', 'tari', 'tasi', 'bollo auto', 'bollo moto', 'canone rai',
    'irpef', 'inps', 'inail', 'agenzia delle entrate', 'agenzia entrate',
    'aci ', 'multa', 'verbale', 'sanzione amministrativa',
  ]],
  ['subscriptions', [
    'netflix', 'spotify', 'amazon prime', 'disney+', 'disney plus', 'apple one',
    'apple music', 'dazn', 'sky q', 'now tv', 'now streaming', 'mediaset infinity',
    'youtube premium', 'google one', 'microsoft 365', 'office 365', 'adobe',
    'dropbox', 'icloud', 'abbonamento', 'addebito ricorrente', 'subscription',
  ]],
  ['utilities', [
    'enel', 'a2a', 'eni gas e luce', 'eni gas', 'acea', 'hera', 'iren',
    'sorgenia', 'e.on', 'eon energia', 'tim', 'vodafone', 'iliad', 'wind tre',
    'wind', 'fastweb', 'tiscali', 'bolletta luce', 'bolletta gas', 'bolletta acqua',
    'bolletta telefono', 'fornitura energia', 'acquedotto', 'rifiuti', 'bolletta',
    'luce', 'gas', 'internet', 'telefono fisso',
  ]],
  ['insurance', [
    'assicurazione', 'assicurazioni', 'polizza', 'generali', 'allianz', 'unipol',
    'zurich', 'cattolica', 'axa', 'reale mutua', 'rca auto', 'kasko',
    'polizza vita', 'polizza casa', 'polizza salute', 'infortuni', 'premio assicurativo',
  ]],
  ['travel', [
    'airbnb', 'booking.com', 'booking', 'ryanair', 'easyjet', 'vueling',
    'ita airways', 'alitalia', 'wizz air', 'italo treno', 'frecciarossa',
    'flixbus', 'blablacar', 'trivago', 'expedia', 'lastminute', 'edreams',
    'hotel', 'hostel', 'volo', 'aeroporto', 'vacanza', 'rentalcars', 'viaggio',
    'agriturismo',
  ]],
  ['pharmacy', [
    'farmacia', 'parafarmacia', 'dr.max', 'lloyds farmacia', 'farmaco',
    'medicinale', 'integratore', 'vitamina', 'erboristeria', 'sanitaria',
    'farmaci',
  ]],
  ['health', [
    'medico', 'dentista', 'odontoiatra', 'ospedale', 'policlinico', 'clinica',
    'ottico', 'fisioterapia', 'osteopata', 'psicologo', 'analisi del sangue',
    'esami del sangue', 'ecografia', 'radiologia', 'visita specialistica',
    'ambulatorio', 'dottore', 'analisi', 'visita',
  ]],
  ['beauty', [
    'parrucchiere', 'barbiere', 'estetista', 'centro estetico', 'sephora',
    'douglas', 'kiko', 'mac cosmetics', 'profumeria', 'cosmetici', 'nail salon',
    'manicure', 'epilazione', 'solarium', 'massaggio',
  ]],
  ['pets', [
    'veterinario', 'clinica veterinaria', 'petshop', 'pet shop', 'zooplus',
    'arcaplanet', 'isola dei tesori', 'mondocane', 'crocchette', 'toelettatura',
    'pensione animali', 'dog sitter',
  ]],
  ['sports', [
    'palestra', 'gym', 'fitness club', 'virgin active', 'mcfit', 'anytime fitness',
    'piscina', 'calcio', 'tennis', 'padel', 'decathlon', 'sportler', 'intersport',
    'nike', 'adidas', 'puma', 'asics', 'new balance', 'pilates', 'yoga',
    'crossfit', 'spinning', 'fitlife', 'sport', 'fitness', 'nuoto',
  ]],
  ['education', [
    'udemy', 'coursera', 'skillshare', 'masterclass', 'duolingo', 'babbel',
    'libri', 'libreria', 'feltrinelli', 'mondadori store', 'hoepli', 'università',
    'tasse universitarie', 'corso', 'tutor', 'scuola', 'asilo', 'nido',
    'master', 'amazon kindle', 'formazione',
  ]],
  ['fuel', [
    'q8', 'eni carburante', 'agip', 'ip stazione', 'esso', 'shell', 'tamoil',
    'total energies', 'totalergies', 'benzina', 'gasolio', 'gpl', 'metano auto',
    'rifornimento', 'enel x way', 'tesla supercharger', 'be charge', 'carburante',
    'diesel',
  ]],
  ['public_transport', [
    'atm ', 'atac', 'amt', 'gtt', 'actv', 'trenitalia', 'italo', 'frecciarossa',
    'autobus', 'metro', 'metropolitana', 'tram', 'taxi', 'radiotaxi', 'uber',
    'bolt', 'free now', 'telepass', 'autostrada', 'bike sharing', 'monopattino',
    'bird', 'lime', 'car sharing', 'share now',
  ]],
  ['groceries', [
    'esselunga', 'coop', 'conad', 'lidl', 'aldi', 'carrefour', 'pam', 'spar',
    'despar', 'eurospar', 'iper', 'ipercoop', 'eurospin', 'penny market',
    'md discount', 'todis', 'naturasi', 'il gigante', 'supermercato', 'ipermercato',
    'spesa', 'tigros', 'bennet', 'famila',
  ]],
  ['restaurants', [
    'ristorante', 'trattoria', 'osteria', 'pizzeria', 'sushi', 'poke', 'ramen',
    'bar ', 'caffè', 'caffe', 'pasticceria', 'gelateria', 'mcdonald', 'mcdonalds',
    'burger king', 'kfc', 'five guys', 'just eat', 'deliveroo', 'glovo',
    'uber eats', 'starbucks', 'mensa', 'tavola calda', 'takeaway', 'dominos',
  ]],
  ['food', [
    'alimentari', 'mercato', 'ortofrutticolo', 'pescheria', 'macelleria',
    'salumeria', 'panificio', 'fornaio', 'minimarket', 'gastronomia',
  ]],
  ['transport', [
    'parcheggio', 'parking', 'autonoleggio', 'hertz', 'avis', 'europcar',
    'maggiore', 'sixt', 'officina', 'carrozzeria', 'gommista', 'pneumatici',
    'revisione', 'tagliando', 'autoricambi', 'rc auto',
  ]],
  ['rent', [
    'affitto', 'mutuo', 'canone locazione', 'locazione', 'condominio',
    'bonifico affitto', 'canone affitto', 'pagamento affitto', 'rata mutuo',
    'mensile mutuo', 'quota condominiale', 'spese condominiali',
    'deposito cauzionale', 'agenzia immobiliare',
  ]],
  ['home', [
    'ikea', 'leroy merlin', 'obi', 'bricoman', 'bricocenter', 'casalinghi',
    'arredamento', 'ferramenta', 'pulizie', 'colf', 'badante', 'idraulico',
    'elettricista', 'falegname', 'zara home', 'trasloco', 'sgombero',
    'riparazioni', 'elettrodomestici',
  ]],
  ['shopping', [
    'zara', 'h&m', 'hm', 'uniqlo', 'mango', 'primark', 'ovs', 'gucci',
    'prada', 'armani', 'amazon', 'ebay', 'zalando', 'asos', 'fnac',
    'mediaworld', 'unieuro', 'euronics', 'apple store', 'samsung', 'vinted',
    'yoox', 'farfetch',
  ]],
  ['entertainment', [
    'cinema', 'uci cinemas', 'teatro', 'opera', 'concerto', 'museo',
    'parco divertimenti', 'gardaland', 'mirabilandia', 'bowling', 'escape room',
    'videogiochi', 'steam', 'playstation store', 'xbox', 'nintendo',
    'ticketmaster', 'ticketone', 'anteo', 'uci',
  ]],
];

export function categorize(description: string): CategoryId {
  const lower = description.toLowerCase();
  // Early exit: affitto/mutuo/condominio → always rent
  if (lower.includes('affitto') || lower.includes('mutuo') || lower.includes('condominio')) {
    return 'rent';
  }
  // Early exit: giroconto → always transfer
  if (lower.includes('giroconto') || lower.includes('giro conto')) {
    return 'transfer';
  }
  // Early exit: taxes
  if (
    lower.includes('f24') || lower.includes('imu') || lower.includes('tari') ||
    lower.includes('tasi') || lower.includes('bollo auto') ||
    lower.includes('bollo moto') || lower.includes('canone rai')
  ) {
    return 'taxes';
  }
  for (const [cat, keywords] of RULES) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return cat;
    }
  }
  return 'other';
}

export type TaxCategory = 'medical' | 'pharmacy' | 'home_renovation' | 'education' | 'business_expense';

export function getTaxInfo(
  description: string,
  category: string,
): { isTaxRelevant: boolean; taxCategory?: TaxCategory } {
  if (category === 'health') return { isTaxRelevant: true, taxCategory: 'medical' };
  if (category === 'pharmacy') return { isTaxRelevant: true, taxCategory: 'pharmacy' };
  if (category === 'education') return { isTaxRelevant: true, taxCategory: 'education' };
  const lower = description.toLowerCase();
  if (lower.includes('dentista') || lower.includes('odontoiatra') || lower.includes('medico') || lower.includes('visita')) {
    return { isTaxRelevant: true, taxCategory: 'medical' };
  }
  if (lower.includes('università') || lower.includes('tasse universitarie') || lower.includes('master')) {
    return { isTaxRelevant: true, taxCategory: 'education' };
  }
  return { isTaxRelevant: false };
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
