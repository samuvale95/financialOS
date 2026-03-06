import type { Transaction, FiscalProfile } from '../types';

const MEDICAL_FRANCHIGIA = 129.11;
const DEDUCTION_RATE = 0.19;
const FORFETTARIO_THRESHOLD = 85_000;

export interface Tax730Result {
  medicalExpenses: number;
  educationExpenses: number;
  deductibleMedical: number;      // max(0, medicalExpenses - 129.11)
  estimatedRefund: number;        // (deductibleMedical + educationExpenses) * 0.19
  missingReceiptsCount: number;   // isTaxRelevant && !attachmentUri
}

export interface ForfettarioResult {
  grossIncome: number;
  imponibile: number;             // grossIncome * coefficienteRedditivita
  inpsTax: number;                // imponibile * gestioneSeparata
  taxableBase: number;            // imponibile - inpsTax
  substituteTax: number;          // taxableBase * aliquotaSostitutiva
  totalTax: number;               // inpsTax + substituteTax
  netIncome: number;              // grossIncome - totalTax
  recommendedSetAside: number;    // totalTax / 12
  thresholdResidual: number;      // 85000 - grossIncome
}

export function calculateEstimated730Refund(transactions: Transaction[]): Tax730Result {
  const taxRelevant = transactions.filter((t) => t.isTaxRelevant === true);

  const medicalExpenses = taxRelevant
    .filter((t) => t.taxCategory === 'medical')
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const pharmacyExpenses = taxRelevant
    .filter((t) => t.taxCategory === 'pharmacy')
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const educationExpenses = taxRelevant
    .filter((t) => t.taxCategory === 'education')
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const totalMedical = medicalExpenses + pharmacyExpenses;
  const deductibleMedical = Math.max(0, totalMedical - MEDICAL_FRANCHIGIA);
  const estimatedRefund = (deductibleMedical + educationExpenses) * DEDUCTION_RATE;

  const missingReceiptsCount = taxRelevant.filter(
    (t) => !t.attachmentUri &&
      (t.taxCategory === 'medical' || t.taxCategory === 'pharmacy')
  ).length;

  return {
    medicalExpenses: totalMedical,
    educationExpenses,
    deductibleMedical,
    estimatedRefund,
    missingReceiptsCount,
  };
}

export function calculateForfettarioNetto(grossIncome: number, profile: FiscalProfile): ForfettarioResult {
  const zero: ForfettarioResult = {
    grossIncome,
    imponibile: 0,
    inpsTax: 0,
    taxableBase: 0,
    substituteTax: 0,
    totalTax: 0,
    netIncome: grossIncome,
    recommendedSetAside: 0,
    thresholdResidual: FORFETTARIO_THRESHOLD,
  };

  if (
    profile.type !== 'forfettario' ||
    !profile.coefficienteRedditivita ||
    !profile.aliquotaSostitutiva ||
    !profile.gestioneSeparata
  ) {
    return zero;
  }

  const imponibile = grossIncome * profile.coefficienteRedditivita;
  const inpsTax = imponibile * profile.gestioneSeparata;
  const taxableBase = imponibile - inpsTax;
  const substituteTax = taxableBase * profile.aliquotaSostitutiva;
  const totalTax = inpsTax + substituteTax;
  const netIncome = grossIncome - totalTax;
  const recommendedSetAside = totalTax / 12;
  const thresholdResidual = FORFETTARIO_THRESHOLD - grossIncome;

  return {
    grossIncome,
    imponibile,
    inpsTax,
    taxableBase,
    substituteTax,
    totalTax,
    netIncome,
    recommendedSetAside,
    thresholdResidual,
  };
}
