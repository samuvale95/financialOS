import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { useData } from './DataContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalysisContextValue {
  selectedMonth: string;       // YYYY-MM
  setSelectedMonth: (m: string) => void;
  isCurrentMonth: boolean;
  availableMonths: string[];   // sorted, derived from transactions
}

// ── Context ───────────────────────────────────────────────────────────────────

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const { transactions } = useData();

  // Stable current calendar month for this session
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  // Derive sorted list of months that have non-transfer transactions
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const t of transactions) {
      if (t.category !== 'transfer') months.add(t.date.slice(0, 7));
    }
    return Array.from(months).sort();
  }, [transactions]);

  // After data loads, if the selected month has no data, jump to the latest month
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths.at(-1)!);
    }
  }, [availableMonths]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCurrentMonth = selectedMonth === currentMonth;

  return (
    <AnalysisContext.Provider value={{ selectedMonth, setSelectedMonth, isCurrentMonth, availableMonths }}>
      {children}
    </AnalysisContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysis must be used inside AnalysisProvider');
  return ctx;
}
