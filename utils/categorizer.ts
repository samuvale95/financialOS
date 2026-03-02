import type { CategoryId } from '../constants/categories';

const RULES: [CategoryId, string[]][] = [
  ['salary', ['stipendio', 'salario', 'busta paga', 'retribuzione', 'cedolino']],
  ['freelance', ['freelance', 'consulenza', 'prestazione', 'parcella', 'fattura', 'cliente', 'progetto']],
  ['investment', ['dividendo', 'cedola', 'interessi', 'rendimento', 'etf', 'azioni', 'borsa', 'trading']],
  ['subscriptions', ['netflix', 'spotify', 'amazon prime', 'disney', 'apple one', 'apple music', 'dazn', 'sky', 'now tv', 'abbonamento', 'subscription']],
  ['utilities', ['enel', 'a2a', 'eni gas', 'acea', 'hera', 'iren', 'tim', 'vodafone', 'iliad', 'wind', 'tre', 'fastweb', 'bolletta', 'luce', 'gas', 'acqua', 'internet', 'telefono']],
  ['travel', ['airbnb', 'booking', 'ryanair', 'alitalia', 'ita airways', 'easyjet', 'blablacar', 'hotel', 'volo', 'aeroporto', 'vacanza', 'viaggio', 'agriturismo']],
  ['health', ['farmacia', 'medico', 'dottore', 'dentista', 'ospedale', 'clinica', 'ottico', 'fisioterapia', 'palestra', 'fitlife', 'wellness', 'parafarmacia', 'analisi']],
  ['education', ['udemy', 'coursera', 'libri', 'libreria', 'feltrinelli', 'mondadori', 'università', 'corso', 'scuola', 'master', 'formazione', 'amazon kindle']],
  ['food', ['esselunga', 'coop', 'conad', 'lidl', 'aldi', 'carrefour', 'pam', 'spar', 'despar', 'iper', 'eurospin', 'ristorante', 'trattoria', 'osteria', 'pizzeria', 'sushi', 'bar', 'caffè', 'caffe', 'mcdonalds', 'burger king', 'kfc', 'just eat', 'deliveroo', 'glovo', 'supermercato', 'alimentari']],
  ['transport', ['atm', 'atac', 'trenitalia', 'italo', 'frecciarossa', 'flixbus', 'autobus', 'metro', 'taxi', 'uber', 'bolt', 'free now', 'q8', 'eni', 'agip', 'ip', 'carburante', 'benzina', 'gasolio', 'telepass', 'autostrada', 'parcheggio', 'bike sharing', 'monopattino']],
  ['shopping', ['zara', 'h&m', 'hm', 'uniqlo', 'mango', 'primark', 'amazon', 'ebay', 'zalando', 'asos', 'ikea', 'leroy merlin', 'obi', 'decathlon', 'sport', 'nike', 'adidas', 'puma', 'mediaworld', 'unieuro', 'euronics', 'apple store', 'samsung', 'fnac']],
  ['entertainment', ['cinema', 'teatro', 'concerto', 'museo', 'parco', 'bowling', 'escape room', 'eventi', 'biglietti', 'ticketmaster', 'ticketone', 'anteo', 'uci']],
  ['home', ['affitto', 'condominio', 'mutuo', 'ikea', 'leroy merlin', 'casalinghi', 'arredamento', 'pulizie', 'riparazioni']],
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
