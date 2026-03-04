import type { StoredBudget, OnboardingGoalId, EffortLevel, HousingType, LifestyleProfile } from '../types';

const BASE_RATIOS: Record<string, number> = {
  groceries: 0.12,
  restaurants: 0.06,
  fuel: 0.03,
  public_transport: 0.03,
  shopping: 0.09,
  entertainment: 0.04,
  sports: 0.02,
  health: 0.03,
  pharmacy: 0.02,
  home: 0.05,        // maintenance, furnishings
  rent: 0.25,        // overridden by actual cost when known
  utilities: 0.07,
  insurance: 0.02,
  subscriptions: 0.03,
  education: 0.04,
};

const EFFORT_RATIOS: Record<EffortLevel, Partial<Record<string, number>>> = {
  leggero: {
    groceries: 0.14,
    restaurants: 0.08,
    shopping: 0.13,
    entertainment: 0.07,
    subscriptions: 0.05,
  },
  moderato: {},
  intenso: {
    groceries: 0.10,
    restaurants: 0.04,
    shopping: 0.06,
    entertainment: 0.02,
    subscriptions: 0.02,
    education: 0.05,
    sports: 0.02,
  },
};

const GOAL_OVERRIDES: Record<OnboardingGoalId, Partial<Record<string, number>>> = {
  risparmio: { shopping: 0.06, entertainment: 0.02, restaurants: 0.04 },
  casa: { rent: 0.30, shopping: 0.06 },
  pensione: { education: 0.07, subscriptions: 0.02, insurance: 0.03 },
  viaggio: { travel: 0.07, entertainment: 0.05 },
  istruzione: { education: 0.10, entertainment: 0.02 },
  emergenza: {},
};

const LIFESTYLE_MULTIPLIERS = {
  sportFrequency: {
    never: 0.5, occasional: 1.0, regular: 1.8, intensive: 2.5,
  },
  travelFrequency: {
    never: 0.5, once_year: 1.0, few_times: 1.6, frequent: 2.5,
  },
  diningOutFrequency: {
    rarely: 0.6, sometimes: 1.0, often: 1.5, daily: 2.2,
  },
} as const;

export const BUDGET_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  groceries: 'Spese al supermercato, alimentari e market. Include la spesa settimanale e i negozi di vicinato.',
  restaurants: 'Pasti fuori casa, pizzerie, ristoranti, bar e servizi di food delivery come Glovo e Deliveroo.',
  food: 'Acquisti alimentari generici, gastronomie e negozi specializzati.',
  fuel: 'Rifornimenti di benzina, gasolio e carburante per veicoli a motore.',
  public_transport: 'Abbonamenti e biglietti per mezzi pubblici, taxi, Uber, treni e bus.',
  transport: 'Parcheggi, autonoleggio e altre spese legate alla mobilità.',
  shopping: 'Abbigliamento, elettronica, acquisti online e spese discrezionali.',
  entertainment: 'Cinema, teatro, concerti, eventi e attività ricreative.',
  sports: 'Palestra, attrezzatura sportiva, piscina, campi sportivi e abbonamenti fitness.',
  health: 'Visite mediche, dentista, fisioterapia, analisi e spese sanitarie.',
  pharmacy: 'Farmaci, parafarmacia, integratori e prodotti sanitari da banco.',
  home: 'Manutenzione casa, arredamento, elettrodomestici e piccole riparazioni.',
  rent: 'Affitto mensile, rata del mutuo, spese condominiali e canoni di locazione.',
  utilities: 'Bollette di luce, gas, acqua, internet e telefonia.',
  insurance: 'Premi assicurativi per auto, casa, vita e polizze varie.',
  subscriptions: 'Abbonamenti digitali ricorrenti come Netflix, Spotify, Amazon Prime.',
  travel: 'Voli, hotel, vacanze, Airbnb e spese di viaggio.',
  education: 'Corsi, libri, università, formazione professionale e piattaforme di e-learning.',
  other: 'Spese non categorizzate o di natura varia.',
};

// Moltiplicatori costo della vita per regione italiana
const REGION_COST: Record<string, number> = {
  'Lombardia': 1.20, 'Lazio': 1.15, 'Toscana': 1.10,
  'Emilia-Romagna': 1.10, 'Liguria': 1.10, 'Veneto': 1.05,
  'Piemonte': 1.05, 'Trentino-Alto Adige': 1.10,
  'Friuli-Venezia Giulia': 1.00, "Valle d'Aosta": 1.05,
  'Umbria': 0.95, 'Marche': 0.95, 'Abruzzo': 0.90,
  'Molise': 0.85, 'Campania': 0.90, 'Puglia': 0.85,
  'Basilicata': 0.85, 'Calabria': 0.80, 'Sicilia': 0.85, 'Sardegna': 0.90,
};

export interface BudgetContext {
  householdSize?: number;
  housingType?: HousingType | null;
  housingMonthlyCost?: number;
  region?: string | null;
  dependents?: number;
  lifestyleProfile?: LifestyleProfile;
}

export function calculateBudgets(
  income: number,
  goals: OnboardingGoalId[],
  effortLevel: EffortLevel = 'moderato',
  ctx: BudgetContext = {}
): StoredBudget[] {
  const ratios = { ...BASE_RATIOS };

  // Livello di impegno
  for (const [cat, ratio] of Object.entries(EFFORT_RATIOS[effortLevel])) {
    if (ratio !== undefined) ratios[cat] = ratio;
  }

  // Override per obiettivo
  for (const goal of goals) {
    for (const [cat, ratio] of Object.entries(GOAL_OVERRIDES[goal])) {
      if (ratio !== undefined) ratios[cat] = ratio;
    }
  }

  // Nucleo familiare: groceries e utilities scalano con il numero di persone
  const hSize = Math.max(1, ctx.householdSize ?? 1);
  if (hSize > 1) {
    ratios.groceries = Math.min((ratios.groceries ?? 0.12) * (1 + (hSize - 1) * 0.15), 0.30);
    ratios.utilities = Math.min(ratios.utilities * (1 + (hSize - 1) * 0.10), 0.15);
  }

  // Figli a carico: più spesa per education e health
  const deps = ctx.dependents ?? 0;
  if (deps > 0) {
    ratios.education = Math.min((ratios.education ?? 0.04) + deps * 0.02, 0.15);
    ratios.health = Math.min((ratios.health ?? 0.03) + deps * 0.01, 0.10);
  }

  // Abitazione: se l'utente paga affitto/mutuo noto, usa rent con il costo reale
  const housingCost = ctx.housingMonthlyCost ?? 0;
  if (income > 0 && housingCost > 0 &&
      (ctx.housingType === 'renter' || ctx.housingType === 'owner')) {
    ratios.rent = Math.min(Math.max(housingCost / income, 0.10), 0.55);
  } else if (ctx.housingType === 'family') {
    delete ratios.rent; // vive con la famiglia, nessun affitto
  }

  // Lifestyle profile adjustments
  const lp = ctx.lifestyleProfile;
  if (lp) {
    const sportMult = LIFESTYLE_MULTIPLIERS.sportFrequency[lp.sportFrequency] ?? 1.0;
    if (ratios.sports !== undefined) ratios.sports *= sportMult;

    const travelMult = LIFESTYLE_MULTIPLIERS.travelFrequency[lp.travelFrequency] ?? 1.0;
    if (ratios.travel !== undefined) ratios.travel *= travelMult;
    else if (travelMult > 1) ratios.travel = 0.04 * travelMult;

    const diningMult = LIFESTYLE_MULTIPLIERS.diningOutFrequency[lp.diningOutFrequency] ?? 1.0;
    if (ratios.restaurants !== undefined) ratios.restaurants *= diningMult;

    // Hobbies: adjust entertainment and education
    let entertainmentBonus = 0;
    for (const hobby of lp.hobbies) {
      if (hobby === 'gaming' || hobby === 'cinema' || hobby === 'music') {
        entertainmentBonus += 0.015;
      } else if (hobby === 'reading') {
        ratios.education = Math.min((ratios.education ?? 0.04) + 0.01, 0.15);
      }
    }
    if (entertainmentBonus > 0) {
      ratios.entertainment = Math.min((ratios.entertainment ?? 0.04) + entertainmentBonus, 0.12);
    }
  }

  // Costo della vita per regione (categorie sensibili al territorio)
  const costMult = ctx.region ? (REGION_COST[ctx.region] ?? 1.0) : 1.0;
  if (costMult !== 1.0) {
    for (const cat of ['groceries', 'restaurants', 'public_transport', 'entertainment', 'shopping']) {
      if (ratios[cat] !== undefined) ratios[cat] *= costMult;
    }
  }

  // Normalizza: il totale non deve superare il 90% del reddito
  const total = Object.values(ratios).reduce((s, v) => s + v, 0);
  if (total > 0.90) {
    const scale = 0.90 / total;
    for (const cat of Object.keys(ratios)) ratios[cat] *= scale;
  }

  return Object.entries(ratios).map(([category, ratio]) => ({
    id: `b_${category}`,
    category: category as StoredBudget['category'],
    limit: Math.round(income * ratio),
    period: 'monthly' as const,
  }));
}

export function getSavingsPotential(
  income: number,
  goals: OnboardingGoalId[],
  effortLevel: EffortLevel,
  ctx?: BudgetContext
): number {
  const budgets = calculateBudgets(income, goals, effortLevel, ctx ?? {});
  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  return Math.max(0, income - totalBudget);
}
