import type { SpendingAnalysis, CategoryAnalysis } from './spendingAnalyzer';
import type { InsightProfile, CategoryTrend } from './insightProfile';
import type { FiscalProfile, Transaction } from '../types';
import type { SpendingAnomaly } from './anomalyDetector';
import { calculateEstimated730Refund, calculateForfettarioNetto } from './taxCalculator';

export interface PersistentInsight {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  body: string;
  trend: 'positive' | 'negative' | 'neutral';
}

export interface CoachRecommendation {
  type: 'positive' | 'action' | 'info';
  title: string;
  body: string;
  potentialSaving?: number; // €/month
}

export interface QuestionOption {
  label: string;
  tag: string;
  recommendation: CoachRecommendation;
}

export interface CoachQuestion {
  id: string;
  category: string;
  priority: number; // 0–100, higher = shown first
  title: string;
  body: string;
  icon: string;
  iconColor: string;
  options: QuestionOption[];
}

// ── Historical context helper ─────────────────────────────────────────────────

/**
 * Returns a short Italian string describing average monthly spend for a category,
 * based on the CategoryTrend stored in the profile. Empty string if no data.
 * Intended to be appended to question / recommendation bodies.
 */
export function getHistoricalContext(profile: InsightProfile, category: string): string {
  const trend: CategoryTrend | undefined = profile.categoryTrends?.find(
    (t) => t.category === category,
  );
  if (!trend || trend.averageMonthly <= 0) return '';
  return `Negli ultimi mesi qui spendi in media €${Math.round(trend.averageMonthly)}.`;
}

// ── Persistent insights ───────────────────────────────────────────────────────

export function generatePersistentInsights(
  analysis: SpendingAnalysis,
  profile: InsightProfile,
  anomalies: SpendingAnomaly[] = [],
): PersistentInsight[] {
  const { monthIncome, totalExpenses, savingsRate, categories } = analysis;
  if (monthIncome === 0 && totalExpenses === 0) return [];

  const today = new Date();
  const daysElapsed = Math.max(1, today.getDate());
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const insights: PersistentInsight[] = [];

  // 1. Risparmio
  const savedAmount = monthIncome - totalExpenses;
  const savingsColor = savingsRate >= 20 ? '#00D68F' : savingsRate >= 10 ? '#FFB347' : '#FF6B6B';
  const savingsTrend: PersistentInsight['trend'] = savingsRate >= 20 ? 'positive' : savingsRate >= 10 ? 'neutral' : 'negative';
  insights.push({
    id: 'savings_rate',
    icon: 'trending-up',
    iconColor: savingsColor,
    title: `Risparmio ${savingsRate.toFixed(0)}%`,
    body: monthIncome > 0
      ? `Stai risparmiando €${savedAmount.toFixed(0)} su €${monthIncome.toFixed(0)} di reddito. ${savingsRate >= 20 ? '≥20% ottimo!' : savingsRate >= 10 ? '≥10% ok, punta al 20%.' : '<10% critico: riduci le uscite.'}`
      : `Uscite totali: €${totalExpenses.toFixed(0)}. Aggiungi il reddito per calcolare il tasso di risparmio.`,
    trend: savingsTrend,
  });

  // 2. Media giornaliera
  if (totalExpenses > 0) {
    const dailyActual = totalExpenses / daysElapsed;
    const dailyBudget = monthIncome > 0 ? monthIncome / daysInMonth : 0;
    const dailyColor = dailyBudget > 0 && dailyActual > dailyBudget ? '#FF6B6B' : '#00D68F';
    insights.push({
      id: 'daily_avg',
      icon: 'calendar',
      iconColor: dailyColor,
      title: `€${dailyActual.toFixed(0)}/giorno`,
      body: dailyBudget > 0
        ? `Media giornaliera: €${dailyActual.toFixed(0)} (budget: €${dailyBudget.toFixed(0)}/giorno). ${dailyActual > dailyBudget ? 'Stai spendendo più del previsto.' : 'Dentro i limiti!'}`
        : `Stai spendendo in media €${dailyActual.toFixed(0)} al giorno in ${daysElapsed} giorni.`,
      trend: dailyBudget > 0 ? (dailyActual <= dailyBudget ? 'positive' : 'negative') : 'neutral',
    });
  }

  // 3. Categoria più efficiente (budgetProgress < 1, budgetLimit > 0)
  const efficientCat = categories
    .filter((c) => c.budgetLimit > 0 && c.budgetProgress < 1 && c.monthTotal > 0)
    .sort((a, b) => a.budgetProgress - b.budgetProgress)[0];
  if (efficientCat) {
    const remaining = efficientCat.budgetLimit - efficientCat.monthTotal;
    insights.push({
      id: `efficient_${efficientCat.category}`,
      icon: efficientCat.icon,
      iconColor: '#00D68F',
      title: `${efficientCat.label} sotto controllo`,
      body: `Hai usato solo il ${Math.round(efficientCat.budgetProgress * 100)}% del budget (€${efficientCat.monthTotal.toFixed(0)} su €${efficientCat.budgetLimit}). Avanzano €${remaining.toFixed(0)}.`,
      trend: 'positive',
    });
  }

  // 4. Proiezione fine mese
  if (totalExpenses > 0 && daysElapsed > 0) {
    const projected = (totalExpenses / daysElapsed) * daysInMonth;
    const projColor = monthIncome > 0 ? (projected < monthIncome ? '#00D68F' : '#FF6B6B') : '#FFB347';
    const projTrend: PersistentInsight['trend'] = monthIncome > 0 ? (projected < monthIncome ? 'positive' : 'negative') : 'neutral';
    const projectionMethod: 'linear' | 'weekday_weighted' = daysElapsed >= 7 ? 'weekday_weighted' : 'linear';
    const methodNote = projectionMethod === 'weekday_weighted'
      ? ' (proiezione pesata per pattern feriali/weekend)'
      : '';
    insights.push({
      id: 'projection',
      icon: 'analytics',
      iconColor: projColor,
      title: `Proiezione: €${projected.toFixed(0)}`,
      body: monthIncome > 0
        ? `Al ritmo attuale spenderai circa €${projected.toFixed(0)} entro fine mese${projected < monthIncome ? `, restando €${(monthIncome - projected).toFixed(0)} di risparmio.` : `. Supereresti il reddito di €${(projected - monthIncome).toFixed(0)}.`}${methodNote}`
        : `Al ritmo attuale le uscite totali di questo mese saranno circa €${projected.toFixed(0)}.${methodNote}`,
      trend: projTrend,
    });
  }

  // 5. Trend personale risparmio (requires ≥3 snapshots)
  const snapshots = profile.monthlySnapshots ?? [];
  if (snapshots.length >= 3) {
    const avgSavings = snapshots.reduce((s, snap) => s + snap.savingsRate, 0) / snapshots.length;
    const delta = savingsRate - avgSavings;
    if (delta > 5) {
      insights.push({
        id: 'savings_trend_personal',
        icon: 'star',
        iconColor: '#00D68F',
        title: `Risparmio sopra la tua media`,
        body: `Questo mese risparmi il ${savingsRate.toFixed(0)}%, ${delta.toFixed(0)} punti sopra la tua media storica del ${avgSavings.toFixed(0)}%. Ottimo trend personale!`,
        trend: 'positive',
      });
    } else if (delta < -5) {
      insights.push({
        id: 'savings_trend_personal',
        icon: 'trending-down',
        iconColor: '#FFB347',
        title: `Risparmio sotto la tua media`,
        body: `La tua media storica è ${avgSavings.toFixed(0)}% di risparmio. Questo mese sei al ${savingsRate.toFixed(0)}%, ${(-delta).toFixed(0)} punti sotto. Tieni d'occhio le spese variabili.`,
        trend: 'negative',
      });
    }
  }

  // 6. Miglioramento per categoria (categoryTrends === 'decreasing')
  const improvingCats = (profile.categoryTrends ?? [])
    .filter((t) => t.trend === 'decreasing')
    .slice(0, 2); // cap at 2 to avoid clutter
  for (const ct of improvingCats) {
    const ca = categories.find((c) => (c.category as string) === ct.category);
    const label = ca?.label ?? ct.category;
    const currentNote = ca && ca.monthTotal > 0
      ? ` Questo mese sei a €${ca.monthTotal.toFixed(0)}.`
      : '';
    insights.push({
      id: `improving_${ct.category}`,
      icon: ca?.icon ?? 'trending-down',
      iconColor: '#00D68F',
      title: `Stai migliorando in ${label}`,
      body: `La tua media in ${label.toLowerCase()} è €${Math.round(ct.averageMonthly)}/mese e stai spendendo meno del solito.${currentNote} Mantieni il ritmo!`,
      trend: 'positive',
    });
  }

  // 7. High-severity anomalies — surfaced as warning insights (cap at 3 to avoid clutter)
  const highAnomalies = anomalies.filter((a) => a.severity === 'high').slice(0, 3);
  for (const anomaly of highAnomalies) {
    insights.push({
      id: `anomaly_${anomaly.type}_${anomaly.category}_${anomaly.date.slice(0, 7)}`,
      icon: 'warning',
      iconColor: '#FF6B6B',
      title: anomaly.title,
      body: anomaly.body,
      trend: 'negative',
    });
  }

  return insights;
}

// ── Question generators ───────────────────────────────────────────────────────

function subscriptionQuestion(ca: CategoryAnalysis): CoachQuestion | null {
  if (ca.category !== 'subscriptions') return null;
  const { recurringItems, monthTotal, txCount } = ca;
  if (txCount < 2 && recurringItems.length < 2) return null;

  const count = recurringItems.length > 0 ? recurringItems.length : txCount;
  const topNames = recurringItems
    .slice(0, 3)
    .map((r) => r.description)
    .join(', ');

  return {
    id: 'q_subscriptions_review',
    category: 'subscriptions',
    priority: ca.status === 'over' ? 85 : 65,
    title: `${count} abbonament${count === 1 ? 'o' : 'i'} rilevat${count === 1 ? 'o' : 'i'}`,
    body:
      `Questo mese hai speso €${monthTotal.toFixed(0)} in abbonamenti` +
      (topNames ? ` (${topNames}${recurringItems.length > 3 ? '…' : ''})` : '') +
      '. Li stai usando tutti regolarmente?',
    icon: 'repeat',
    iconColor: '#FF6B6B',
    options: [
      {
        label: 'Sì, li uso tutti',
        tag: 'use_all',
        recommendation: {
          type: 'positive',
          title: 'Bene, sei consapevole!',
          body: `€${monthTotal.toFixed(0)}/mese in abbonamenti è sostenibile se li usi davvero. Ricorda di rivedere la lista ogni 3–6 mesi.`,
        },
      },
      {
        label: 'Qualcuno no',
        tag: 'some_unused',
        recommendation: {
          type: 'action',
          title: 'Controlla cosa puoi disdire',
          body: `Anche solo €10–15/mese in meno fanno €120–180/anno. Elenco le uscite ricorrenti e disdici quelle che non usi da oltre un mese.`,
          potentialSaving: Math.round(monthTotal * 0.25),
        },
      },
      {
        label: 'La maggior parte no',
        tag: 'mostly_unused',
        recommendation: {
          type: 'action',
          title: 'Revisione urgente degli abbonamenti',
          body: `Stai pagando €${monthTotal.toFixed(0)}/mese per servizi che non usi. Apri l'app della banca, cerca le uscite ricorrenti e disdici subito quelle non necessarie.`,
          potentialSaving: Math.round(monthTotal * 0.6),
        },
      },
    ],
  };
}

const DINING_KEYWORDS = [
  'ristorante', 'restaurant', 'pizzeria', 'sushi', 'poke', 'trattoria',
  'osteria', 'bar ', 'café', 'cafe', 'bistro', 'glovo', 'deliveroo',
  'just eat', 'uber eat', 'burger', 'mcdonald', 'mensa',
];

function diningQuestion(ca: CategoryAnalysis): CoachQuestion | null {
  if (ca.category !== 'food' && ca.category !== 'entertainment') return null;

  const diningMerchants = ca.topMerchants.filter((m) =>
    DINING_KEYWORDS.some((k) => m.name.toLowerCase().includes(k))
  );

  const diningCount = diningMerchants.reduce((s, m) => s + m.count, 0);
  if (diningCount < 4) return null;

  const diningTotal = diningMerchants.reduce((s, m) => s + m.total, 0);
  const topPlace = diningMerchants[0];

  return {
    id: `q_dining_${ca.category}`,
    category: ca.category,
    priority: ca.status === 'over' ? 80 : 55,
    title: `${diningCount} uscite fuori questo mese`,
    body:
      `Hai speso €${diningTotal.toFixed(0)} mangiando o ordinando cibo fuori (${diningCount} volte)` +
      (topPlace
        ? `. ${topPlace.name}: ${topPlace.count}x per €${topPlace.total.toFixed(0)}`
        : '') +
      '. È una priorità consapevole per te?',
    icon: 'restaurant',
    iconColor: '#FF9500',
    options: [
      {
        label: 'Sì, è importante',
        tag: 'dining_priority',
        recommendation: {
          type: 'info',
          title: 'Scelta consapevole, bene',
          body: `Mangiare fuori è un piacere legittimo. Assicurati che rientri nel budget ${ca.label.toLowerCase()} (€${ca.budgetLimit}/mese).`,
        },
      },
      {
        label: 'Sto esagerando',
        tag: 'dining_too_much',
        recommendation: {
          type: 'action',
          title: 'Riduci le uscite gradualmente',
          body: `Passa da ${diningCount} a ${Math.max(2, Math.round(diningCount * 0.6))} uscite al mese. Potresti risparmiare circa €${Math.round(diningTotal * 0.4)}/mese senza rinunciare completamente al piacere.`,
          potentialSaving: Math.round(diningTotal * 0.4),
        },
      },
      {
        label: 'È per lavoro',
        tag: 'dining_work',
        recommendation: {
          type: 'info',
          title: 'Tienile separate per i rimborsi',
          body: `Se sono spese lavorative, annotale e richiedi rimborso. Potresti anche dedurle fiscalmente (verifica con il tuo commercialista).`,
        },
      },
    ],
  };
}

function diningReturningQuestion(
  ca: CategoryAnalysis,
  committedMonth: string, // YYYY-MM when user answered dining_too_much
  currentMonth: string,
): CoachQuestion | null {
  const diningMerchants = ca.topMerchants.filter((m) =>
    DINING_KEYWORDS.some((k) => m.name.toLowerCase().includes(k)),
  );
  const diningCount = diningMerchants.reduce((s, m) => s + m.count, 0);
  if (diningCount < 4) return null;

  const diningTotal = diningMerchants.reduce((s, m) => s + m.total, 0);
  const monthLabel = new Date(committedMonth + '-01').toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  });

  return {
    id: `q_dining_returning_${ca.category}_${currentMonth}`,
    category: ca.category,
    priority: 72,
    title: `Ristoranti: di nuovo in aumento`,
    body: `A ${monthLabel} avevi detto che stavi esagerando con il mangiare fuori. Questo mese sei tornato a €${diningTotal.toFixed(0)} (${diningCount} uscite). Come mai?`,
    icon: 'restaurant',
    iconColor: '#FF9500',
    options: [
      {
        label: 'Mi sono perso',
        tag: 'dining_relapsed',
        recommendation: {
          type: 'action',
          title: 'Riparti dal piano',
          body: `Succede. Fissa un massimo settimanale (es. 2 uscite), metti un promemoria venerdì per non superarlo. Risparmio potenziale: €${Math.round(diningTotal * 0.35)}/mese.`,
          potentialSaving: Math.round(diningTotal * 0.35),
        },
      },
      {
        label: 'Periodo particolare',
        tag: 'dining_special_period',
        recommendation: {
          type: 'positive',
          title: 'Ci stanno le eccezioni',
          body: `Va bene per questo mese. Controlla nei prossimi 2 mesi se il trend si stabilizza o se hai bisogno di aggiornare il budget.`,
        },
      },
    ],
  };
}

function shoppingOverBudgetQuestion(ca: CategoryAnalysis): CoachQuestion | null {
  if (ca.category !== 'shopping' || ca.status !== 'over') return null;
  const overspend = ca.monthTotal - ca.budgetLimit;

  return {
    id: 'q_shopping_over_budget',
    category: 'shopping',
    priority: 75,
    title: `Shopping: €${overspend.toFixed(0)} oltre il budget`,
    body: `Hai speso €${ca.monthTotal.toFixed(0)} in shopping questo mese, €${overspend.toFixed(0)} in più rispetto al limite di €${ca.budgetLimit}. Come mai?`,
    icon: 'bag',
    iconColor: '#FF6B9D',
    options: [
      {
        label: 'Acquisti necessari',
        tag: 'shopping_needed',
        recommendation: {
          type: 'info',
          title: 'Valuta di aggiornare il budget',
          body: `Se è una spesa ricorrente, aumenta il limite del budget shopping. Uno realistico funziona meglio di uno continuamente superato.`,
        },
      },
      {
        label: 'Acquisti impulsivi',
        tag: 'shopping_impulse',
        recommendation: {
          type: 'action',
          title: 'Prova la regola delle 24 ore',
          body: `Prima di ogni acquisto non pianificato, aspetta 24 ore. Se il giorno dopo lo vuoi ancora compralo. Spesso l'impulso passa e risparmi €${Math.round(overspend * 0.5)}/mese.`,
          potentialSaving: Math.round(overspend * 0.5),
        },
      },
      {
        label: 'Occasione speciale',
        tag: 'shopping_occasion',
        recommendation: {
          type: 'positive',
          title: 'Le eccezioni ci stanno',
          body: `Va bene per questo mese. Tieni d'occhio il budget nei prossimi mesi per compensare l'extra.`,
        },
      },
    ],
  };
}

function weekendSpendingQuestion(ca: CategoryAnalysis): CoachQuestion | null {
  if (ca.txCount < 4 || ca.weekendTotal <= 0 || ca.monthTotal < 30) return null;
  const weekendPct = ca.weekendTotal / ca.monthTotal;
  if (weekendPct < 0.62) return null;

  return {
    id: `q_weekend_${ca.category}`,
    category: ca.category,
    priority: 45,
    title: `${Math.round(weekendPct * 100)}% delle spese in ${ca.label} nel weekend`,
    body: `Nel weekend spendi €${ca.weekendTotal.toFixed(0)} vs €${ca.weekdayTotal.toFixed(0)} nei giorni feriali per ${ca.label.toLowerCase()}. È un pattern voluto?`,
    icon: 'calendar',
    iconColor: '#BF5AF2',
    options: [
      {
        label: 'Sì, è normale per me',
        tag: 'weekend_ok',
        recommendation: {
          type: 'positive',
          title: 'Nessun problema',
          body: `Spendere di più nel weekend è comune. L'importante è che rimanga dentro il budget mensile complessivo (€${ca.budgetLimit}/mese).`,
        },
      },
      {
        label: 'Non me n\'ero accorto',
        tag: 'weekend_unaware',
        recommendation: {
          type: 'action',
          title: 'Imposta un budget weekend mentale',
          body: `Decidi in anticipo quanto vuoi spendere nel weekend. Avere un numero in testa riduce le spese impulsive del ${Math.round(weekendPct * 30)}–40%.`,
          potentialSaving: Math.round(ca.weekendTotal * 0.25),
        },
      },
    ],
  };
}

function trendIncreaseQuestion(ca: CategoryAnalysis, month: string): CoachQuestion | null {
  if (ca.vsLastMonth < 35 || ca.prevMonthTotal < 20 || ca.monthTotal < 50) return null;

  return {
    id: `q_trend_${ca.category}_${month}`,
    category: ca.category,
    priority: 60,
    title: `${ca.label} in aumento del ${Math.round(ca.vsLastMonth)}%`,
    body: `Questo mese €${ca.monthTotal.toFixed(0)} in ${ca.label.toLowerCase()}, il ${Math.round(ca.vsLastMonth)}% in più rispetto a ${ca.prevMonthTotal.toFixed(0)}€ del mese scorso. C'è una ragione?`,
    icon: 'trending-up',
    iconColor: '#FF6B6B',
    options: [
      {
        label: 'Spesa una tantum',
        tag: 'trend_onetime',
        recommendation: {
          type: 'positive',
          title: 'Caso eccezionale, ok',
          body: `Tieni d'occhio il prossimo mese per assicurarti che torni alla norma (€${ca.prevMonthTotal.toFixed(0)}).`,
        },
      },
      {
        label: 'Nuova abitudine',
        tag: 'trend_habit',
        recommendation: {
          type: 'action',
          title: 'Aggiorna il budget',
          body: `Se questa è la nuova normalità, aggiorna il budget ${ca.label.toLowerCase()} a €${Math.round(ca.monthTotal * 1.05)}. Un budget realistico funziona meglio di uno sempre sforato.`,
        },
      },
      {
        label: 'Non so perché',
        tag: 'trend_unknown',
        recommendation: {
          type: 'action',
          title: 'Analizza le singole uscite',
          body: `Controlla le ${ca.txCount} transazioni in ${ca.label.toLowerCase()} questo mese. Spesso guardare i merchant specifici rivela la causa.`,
        },
      },
    ],
  };
}

function lowSavingsQuestion(
  savingsRate: number,
  totalExpenses: number,
  month: string,
  historyNote: string | null = null,
): CoachQuestion | null {
  if (savingsRate >= 10 || totalExpenses === 0) return null;

  let body: string;
  if (savingsRate <= 0) {
    body = `Questo mese le uscite superano il reddito importato. Controlla se tutti i movimenti in entrata sono stati caricati correttamente.`;
  } else if (historyNote) {
    body = historyNote;
  } else {
    body = `Stai risparmiando solo il ${Math.round(savingsRate)}% del reddito. L'obiettivo ideale è almeno il 20%. Da dove vorresti iniziare a ridurre?`;
  }

  return {
    id: `q_savings_low_${month}`,
    category: 'other',
    priority: 90,
    title:
      savingsRate <= 0
        ? 'Le spese superano il reddito registrato'
        : `Risparmio solo al ${Math.round(savingsRate)}%`,
    body,
    icon: 'warning',
    iconColor: '#FF6B6B',
    options: [
      {
        label: 'Sto cercando di migliorare',
        tag: 'savings_improving',
        recommendation: {
          type: 'action',
          title: 'Parti dal 5%, poi scala',
          body: `Prova a risparmiare il 5% del reddito questo mese. Ogni mese aumenta di 2–3 punti percentuali. Il cambiamento graduale è più sostenibile.`,
          potentialSaving: Math.round(totalExpenses * 0.05),
        },
      },
      {
        label: 'Le spese fisse sono alte',
        tag: 'savings_fixed_costs',
        recommendation: {
          type: 'info',
          title: 'Rivedi le spese fisse',
          body: `Controlla: provider internet, assicurazioni, abbonamenti ricorrenti. Anche €30–50/mese in meno sulle fisso fanno €360–600/anno.`,
        },
      },
      {
        label: 'Mese difficile',
        tag: 'savings_hard_month',
        recommendation: {
          type: 'positive',
          title: 'Ci stanno i mesi difficili',
          body: `Ciò che conta è la media annuale, non il singolo mese. Cerca di compensare nei prossimi.`,
        },
      },
    ],
  };
}

function groceriesQuestion(ca: CategoryAnalysis): CoachQuestion | null {
  if (ca.category !== 'groceries' || ca.monthTotal < 400) return null;

  return {
    id: 'q_groceries_high',
    category: 'groceries',
    priority: ca.status === 'over' ? 70 : 50,
    title: `Supermercato: €${ca.monthTotal.toFixed(0)} questo mese`,
    body: `La spesa alimentare è stata di €${ca.monthTotal.toFixed(0)}. Come mai è così alta?`,
    icon: 'cart',
    iconColor: '#4FC3F7',
    options: [
      {
        label: 'Famiglia numerosa',
        tag: 'groceries_family',
        recommendation: {
          type: 'info',
          title: 'Normale per un nucleo grande',
          body: `Con più persone in casa, la spesa cresce. Considera acquisti in blocco, prodotti a marchio del supermercato e la spesa online per risparmiare il 10–15%.`,
        },
      },
      {
        label: 'Prodotti di qualità',
        tag: 'groceries_quality',
        recommendation: {
          type: 'positive',
          title: 'Scelta consapevole',
          body: `Investire in cibo di qualità è sano. Se rientra nel budget, è una priorità legittima. Considera di bilanciare con qualche prodotto generico per le categorie meno critiche.`,
        },
      },
      {
        label: 'Sprechi da ridurre',
        tag: 'groceries_waste',
        recommendation: {
          type: 'action',
          title: 'Pianifica la spesa',
          body: `Fai una lista prima di andare al supermercato e segui il metodo FIFO (usa prima ciò che è più vecchio). Potresti ridurre lo spreco alimentare del 20–30% e risparmiare €${Math.round(ca.monthTotal * 0.20)}/mese.`,
          potentialSaving: Math.round(ca.monthTotal * 0.20),
        },
      },
    ],
  };
}

function rentQuestion(ca: CategoryAnalysis, monthIncome: number): CoachQuestion | null {
  if (ca.category !== 'rent' || ca.monthTotal === 0) return null;
  if (monthIncome <= 0) return null;
  const rentPct = Math.round((ca.monthTotal / monthIncome) * 100);
  if (rentPct < 35) return null;

  return {
    id: 'q_rent_high_pct',
    category: 'rent',
    priority: 80,
    title: `Affitto al ${rentPct}% del reddito`,
    body: `L'affitto/mutuo pesa il ${rentPct}% del tuo reddito mensile (€${ca.monthTotal.toFixed(0)} su €${monthIncome.toFixed(0)}). È sostenibile?`,
    icon: 'home',
    iconColor: '#FF9500',
    options: [
      {
        label: 'Sì, è gestibile',
        tag: 'rent_ok',
        recommendation: {
          type: 'info',
          title: 'Monitora le spese variabili',
          body: `Con un'alta incidenza dell'affitto, è importante tenere sotto controllo le spese discrezionali (shopping, ristoranti) per mantenere un buon tasso di risparmio.`,
        },
      },
      {
        label: 'Sto cercando di ridurre',
        tag: 'rent_reducing',
        recommendation: {
          type: 'action',
          title: 'Valuta le alternative',
          body: `Considera: un coinquilino per dividere l'affitto, una zona leggermente più periferica, o rinegoziare il contratto. Anche €100/mese in meno fanno €1.200/anno.`,
          potentialSaving: Math.round(ca.monthTotal * 0.10),
        },
      },
      {
        label: 'È temporaneo',
        tag: 'rent_temporary',
        recommendation: {
          type: 'positive',
          title: 'Situazione transitoria, ok',
          body: `Se è temporaneo, mantieni alta la consapevolezza sulle altre spese. Appena la situazione cambia, cerca di portare l'affitto sotto il 30% del reddito.`,
        },
      },
    ],
  };
}

function sportsHealthyQuestion(ca: CategoryAnalysis): CoachQuestion | null {
  if (ca.category !== 'sports' || ca.monthTotal < 80) return null;
  if (ca.status === 'over') return null; // already handled by other questions

  return {
    id: 'q_sports_within_budget',
    category: 'sports',
    priority: 40,
    title: `Sport: €${ca.monthTotal.toFixed(0)} questo mese`,
    body: `Hai speso €${ca.monthTotal.toFixed(0)} in attività sportive, rimanendo dentro il budget. Ottima abitudine! Come ottimizzi i costi?`,
    icon: 'fitness',
    iconColor: '#00D68F',
    options: [
      {
        label: 'Ho un abbonamento fisso',
        tag: 'sports_subscription',
        recommendation: {
          type: 'positive',
          title: 'Abbonamento = risparmio',
          body: `Un abbonamento mensile di solito costa meno di 4–5 ingressi singoli. Se vai almeno 3 volte a settimana, stai ottimizzando bene.`,
        },
      },
      {
        label: 'Vado quando posso',
        tag: 'sports_occasional',
        recommendation: {
          type: 'info',
          title: 'Valuta il piano più adatto',
          body: `Se vai meno di 8 volte al mese, considera un piano entry-level o palestre low-cost come McFit. Potresti risparmiare €${Math.round(ca.monthTotal * 0.3)}/mese.`,
          potentialSaving: Math.round(ca.monthTotal * 0.3),
        },
      },
    ],
  };
}

function utilitiesQuestion(ca: CategoryAnalysis): CoachQuestion | null {
  if (ca.category !== 'utilities' || ca.monthTotal < 200) return null;

  return {
    id: 'q_utilities_high',
    category: 'utilities',
    priority: ca.status === 'over' ? 72 : 52,
    title: `Bollette alte: €${ca.monthTotal.toFixed(0)}/mese`,
    body: `Le utenze (luce, gas, acqua, internet) ti costano €${ca.monthTotal.toFixed(0)} questo mese. Hai valutato offerte alternative?`,
    icon: 'flash',
    iconColor: '#FFB347',
    options: [
      {
        label: 'Ho già ottimizzato',
        tag: 'utilities_optimized',
        recommendation: {
          type: 'positive',
          title: 'Ben fatto!',
          body: `Se hai già confrontato i fornitori, sei sulla buona strada. Rinnova il confronto ogni 12 mesi perché i prezzi cambiano.`,
        },
      },
      {
        label: 'Non ho mai confrontato',
        tag: 'utilities_never_compared',
        recommendation: {
          type: 'action',
          title: 'Confronta i fornitori',
          body: `Usa portali come Segugio.it o il Portale Offerte ARERA per confrontare luce e gas. Cambiare fornitore può far risparmiare €${Math.round(ca.monthTotal * 0.15)}–€${Math.round(ca.monthTotal * 0.25)}/mese senza cambiare nulla in casa.`,
          potentialSaving: Math.round(ca.monthTotal * 0.20),
        },
      },
      {
        label: 'È un momento alto',
        tag: 'utilities_peak',
        recommendation: {
          type: 'info',
          title: 'Stagionalità normale',
          body: `Luce e gas variano con le stagioni. Usa la media annuale come riferimento e considera tariffe biorarie per ridurre il costo nei mesi più caldi.`,
        },
      },
    ],
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateCoachQuestions(
  analysis: SpendingAnalysis,
  profile: InsightProfile,
  month: string,
): CoachQuestion[] {
  const questions: CoachQuestion[] = [];

  const isAnswered = (id: string) =>
    !!profile.answeredQuestions[id] || !!profile.dismissedQuestions[id];

  // ── Savings history note ────────────────────────────────────────────────────
  // If user previously committed to saving_improving on a past q_savings_low_* and
  // savings rate has since changed, personalise the current question body.
  let savingsHistoryNote: string | null = null;
  const pastSavingsEntry = Object.entries(profile.answeredQuestions)
    .filter(([id, a]) => id.startsWith('q_savings_low_') && a.tag === 'savings_improving')
    .sort(([idA], [idB]) => idB.localeCompare(idA)) // most recent first
    [0] ?? null;
  if (pastSavingsEntry) {
    const [pastId, _] = pastSavingsEntry;
    const pastMonth = pastId.replace('q_savings_low_', '');
    const pastSnapshot = profile.monthlySnapshots?.find((s) => s.month === pastMonth);
    if (pastSnapshot) {
      const then = pastSnapshot.savingsRate.toFixed(0);
      const now = analysis.savingsRate.toFixed(0);
      if (analysis.savingsRate > pastSnapshot.savingsRate) {
        savingsHistoryNote = `Stai migliorando! Da ${pastMonth} (${then}%) sei salito al ${now}% — continua così, punta al 20%.`;
      } else {
        const pastMonthLabel = new Date(pastMonth + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        savingsHistoryNote = `A ${pastMonthLabel} avevi detto che stavi cercando di migliorare (eri al ${then}%). Ora sei al ${now}% — ripartiamo insieme?`;
      }
    }
  }

  // Global: low savings check (versioned monthly so "Mese difficile" can re-surface next month)
  const savingsQ = lowSavingsQuestion(analysis.savingsRate, analysis.totalExpenses, month, savingsHistoryNote);
  if (savingsQ && !isAnswered(savingsQ.id)) questions.push(savingsQ);

  // Per-category questions
  for (const ca of analysis.categories) {
    if (ca.monthTotal === 0) continue;

    const generators = [
      (ca: CategoryAnalysis) => subscriptionQuestion(ca),
      (ca: CategoryAnalysis) => diningQuestion(ca),
      (ca: CategoryAnalysis) => shoppingOverBudgetQuestion(ca),
      (ca: CategoryAnalysis) => weekendSpendingQuestion(ca),
      (ca: CategoryAnalysis) => trendIncreaseQuestion(ca, month),
      (ca: CategoryAnalysis) => groceriesQuestion(ca),
      (ca: CategoryAnalysis) => rentQuestion(ca, analysis.monthIncome),
      (ca: CategoryAnalysis) => sportsHealthyQuestion(ca),
      (ca: CategoryAnalysis) => utilitiesQuestion(ca),
    ];

    for (const gen of generators) {
      const q = gen(ca);
      if (q && !isAnswered(q.id)) questions.push(q);
    }

    // ── Dining returning check ──────────────────────────────────────────────
    // If user previously committed to reducing dining but spending is high again,
    // surface a contextual returning question (monthly-versioned so it can resurface).
    if (ca.category === 'food' || ca.category === 'entertainment') {
      const diningAnswered = profile.answeredQuestions[`q_dining_${ca.category}`];
      if (diningAnswered?.tag === 'dining_too_much') {
        const committedMonth = diningAnswered.answeredAt.slice(0, 7);
        const returningQ = diningReturningQuestion(ca, committedMonth, month);
        if (returningQ && !isAnswered(returningQ.id)) questions.push(returningQ);
      }
    }
  }

  return questions.sort((a, b) => b.priority - a.priority);
}

// ── Tax insights ──────────────────────────────────────────────────────────────

export function generateTaxInsights(
  profile: FiscalProfile,
  transactions: Transaction[],
): PersistentInsight[] {
  const insights: PersistentInsight[] = [];
  const currentYear = new Date().getFullYear().toString();

  if (
    profile.type === 'forfettario' &&
    profile.coefficienteRedditivita &&
    profile.aliquotaSostitutiva &&
    profile.gestioneSeparata
  ) {
    const ytdIncome = transactions
      .filter((t) => t.amount > 0 && t.category !== 'transfer' && t.date.startsWith(currentYear))
      .reduce((s, t) => s + t.amount, 0);
    const result = calculateForfettarioNetto(ytdIncome, profile);

    if (result.thresholdResidual < 25_000) {
      insights.push({
        id: 'tax_forfettario_threshold',
        icon: 'warning',
        iconColor: result.thresholdResidual < 15_000 ? '#FF6B6B' : '#FFB347',
        title: `Residuo soglia: €${result.thresholdResidual.toFixed(0)}`,
        body: `Hai fatturato €${ytdIncome.toFixed(0)} quest'anno. Superare 85.000€ comporta l'uscita dal regime forfettario.`,
        trend: result.thresholdResidual < 15_000 ? 'negative' : 'neutral',
      });
    }

    if (result.recommendedSetAside > 0) {
      insights.push({
        id: 'tax_forfettario_setaside',
        icon: 'wallet',
        iconColor: '#6C63FF',
        title: `Accantona €${result.recommendedSetAside.toFixed(0)}/mese`,
        body: `Con un imponibile stimato di €${result.imponibile.toFixed(0)}, accantonare €${result.recommendedSetAside.toFixed(0)}/mese copre imposte e contributi INPS (totale ~€${result.totalTax.toFixed(0)}).`,
        trend: 'neutral',
      });
    }
  }

  if (profile.type === 'dipendente') {
    const result = calculateEstimated730Refund(transactions);
    if (result.estimatedRefund > 0) {
      insights.push({
        id: 'tax_730_refund',
        icon: 'receipt',
        iconColor: '#00D68F',
        title: `Rimborso 730 stimato: €${result.estimatedRefund.toFixed(0)}`,
        body: `Spese mediche detraibili: €${result.deductibleMedical.toFixed(0)}. Istruzione: €${result.educationExpenses.toFixed(0)}. Detrazione 19% = €${result.estimatedRefund.toFixed(0)}.`,
        trend: 'positive',
      });
    }
    if (result.missingReceiptsCount > 0) {
      insights.push({
        id: 'tax_missing_receipts',
        icon: 'camera',
        iconColor: '#FFB347',
        title: `${result.missingReceiptsCount} scontrini fiscali mancanti`,
        body: `Hai spese mediche/farmacia senza foto dello scontrino allegata. Fotografale per avere prova in caso di controllo per il 730.`,
        trend: 'negative',
      });
    }
  }

  return insights;
}
