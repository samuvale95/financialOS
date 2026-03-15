import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Polyline, Rect, Line, Text as SvgText } from 'react-native-svg';
import { Colors, Typography, Radius } from '../../constants/theme';
import { Page, PageSection } from '../../components/layout/Page';
import { Card, AccentCard } from '../../components/ui/Card';
import { useData } from '../../contexts/DataContext';
import { analyzeSpending, getBudgetForecast, analyzeHistory } from '../../utils/spendingAnalyzer';
import type { BudgetForecast, MonthlySnapshot } from '../../utils/spendingAnalyzer';
import { generateCoachQuestions, generatePersistentInsights, generateTaxInsights } from '../../utils/coachEngine';
import type { PersistentInsight } from '../../utils/coachEngine';
import { detectAnomalies } from '../../utils/anomalyDetector';
import type { CategoryAnalysis } from '../../utils/spendingAnalyzer';
import type { CoachQuestion, CoachRecommendation } from '../../utils/coachEngine';
import { useSettings } from '../../contexts/SettingsContext';
import { useAnalysis } from '../../contexts/AnalysisContext';
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary';
import MonthSelectorStrip from '../../components/MonthSelectorStrip';

// ── History Charts ────────────────────────────────────────────────────────────

const CHART_W = 280;

function TrendLineChart({ snapshots }: { snapshots: MonthlySnapshot[] }) {
  const maxVal = Math.max(...snapshots.map((s) => s.totalExpenses), 1);
  const H = 80;
  const padL = 36;
  const padB = 20;
  const padT = 8;
  const innerW = CHART_W - padL - 8;
  const innerH = H - padT - padB;

  const pts = snapshots.map((s, i) => {
    const x = padL + (i / Math.max(snapshots.length - 1, 1)) * innerW;
    const y = padT + (1 - s.totalExpenses / maxVal) * innerH;
    return `${x},${y}`;
  }).join(' ');

  const gridLines = [0, 0.5, 1];

  const abbrevMonth = (ym: string) => {
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const m = parseInt(ym.split('-')[1], 10) - 1;
    return months[m] ?? '';
  };

  return (
    <Svg width={CHART_W} height={H}>
      {gridLines.map((ratio, i) => {
        const y = padT + ratio * innerH;
        const val = maxVal * (1 - ratio);
        return (
          <React.Fragment key={i}>
            <Line x1={padL} y1={y} x2={CHART_W - 8} y2={y} stroke={Colors.border.default} strokeWidth={0.5} />
            <SvgText x={padL - 4} y={y + 3} fontSize={8} fill={Colors.text.muted} textAnchor="end">
              {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
            </SvgText>
          </React.Fragment>
        );
      })}
      <Polyline points={pts} fill="none" stroke={Colors.accent.primary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {snapshots.map((s, i) => {
        const x = padL + (i / Math.max(snapshots.length - 1, 1)) * innerW;
        const y = padT + (1 - s.totalExpenses / maxVal) * innerH;
        return (
          <React.Fragment key={i}>
            <Rect x={x - 2} y={y - 2} width={4} height={4} rx={2} fill={Colors.accent.primary} />
            <SvgText x={x} y={H - 4} fontSize={8} fill={Colors.text.muted} textAnchor="middle">
              {abbrevMonth(s.month)}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function IncomeExpenseBarChart({ snapshots }: { snapshots: MonthlySnapshot[] }) {
  const allVals = snapshots.flatMap((s) => [s.totalExpenses, s.monthIncome]);
  const maxVal = Math.max(...allVals, 1);
  const H = 90;
  const padL = 36;
  const padB = 20;
  const padT = 8;
  const innerW = CHART_W - padL - 8;
  const innerH = H - padT - padB;
  const slotW = innerW / snapshots.length;
  const barW = Math.max(4, slotW * 0.35);

  const abbrevMonth = (ym: string) => {
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const m = parseInt(ym.split('-')[1], 10) - 1;
    return months[m] ?? '';
  };

  return (
    <Svg width={CHART_W} height={H}>
      {[0, 0.5, 1].map((ratio, i) => {
        const y = padT + ratio * innerH;
        const val = maxVal * (1 - ratio);
        return (
          <React.Fragment key={i}>
            <Line x1={padL} y1={y} x2={CHART_W - 8} y2={y} stroke={Colors.border.default} strokeWidth={0.5} />
            <SvgText x={padL - 4} y={y + 3} fontSize={8} fill={Colors.text.muted} textAnchor="end">
              {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
            </SvgText>
          </React.Fragment>
        );
      })}
      {snapshots.map((s, i) => {
        const cx = padL + i * slotW + slotW / 2;
        const incomeH = (s.monthIncome / maxVal) * innerH;
        const expH = (s.totalExpenses / maxVal) * innerH;
        return (
          <React.Fragment key={i}>
            <Rect
              x={cx - barW - 1} y={padT + innerH - incomeH}
              width={barW} height={Math.max(incomeH, 0.5)}
              rx={1.5} fill={Colors.semantic.success + 'CC'}
            />
            <Rect
              x={cx + 1} y={padT + innerH - expH}
              width={barW} height={Math.max(expH, 0.5)}
              rx={1.5} fill={Colors.semantic.danger + 'CC'}
            />
            <SvgText x={cx} y={H - 4} fontSize={8} fill={Colors.text.muted} textAnchor="middle">
              {abbrevMonth(s.month)}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function SavingsRateSparkline({ snapshots }: { snapshots: MonthlySnapshot[] }) {
  const H = 56;
  const padL = 28;
  const padB = 16;
  const padT = 6;
  const innerW = CHART_W - padL - 8;
  const innerH = H - padT - padB;
  const maxRate = Math.max(...snapshots.map((s) => s.savingsRate), 30);

  const currentRate = snapshots[snapshots.length - 1]?.savingsRate ?? 0;
  const lineColor =
    currentRate >= 20 ? Colors.semantic.success :
    currentRate >= 10 ? Colors.semantic.warning :
    Colors.semantic.danger;

  const pts = snapshots.map((s, i) => {
    const x = padL + (i / Math.max(snapshots.length - 1, 1)) * innerW;
    const y = padT + (1 - Math.min(s.savingsRate, maxRate) / maxRate) * innerH;
    return `${x},${y}`;
  }).join(' ');

  const targetY = padT + (1 - Math.min(20, maxRate) / maxRate) * innerH;

  return (
    <Svg width={CHART_W} height={H}>
      <Line x1={padL} y1={targetY} x2={CHART_W - 8} y2={targetY}
        stroke={Colors.semantic.success} strokeWidth={0.8} strokeDasharray="4,3" />
      <SvgText x={padL - 4} y={targetY + 3} fontSize={8} fill={Colors.semantic.success} textAnchor="end">
        20%
      </SvgText>
      <Polyline points={pts} fill="none" stroke={lineColor} strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />
      {snapshots.map((s, i) => {
        const x = padL + (i / Math.max(snapshots.length - 1, 1)) * innerW;
        const y = padT + (1 - Math.min(s.savingsRate, maxRate) / maxRate) * innerH;
        return (
          <Rect key={i} x={x - 2} y={y - 2} width={4} height={4} rx={2} fill={lineColor} />
        );
      })}
    </Svg>
  );
}

function HistoryChartsSection({ snapshots }: { snapshots: MonthlySnapshot[] }) {
  const withData = snapshots.filter((s) => s.totalExpenses > 0 || s.monthIncome > 0);
  if (withData.length < 2) return null;

  const currentRate = withData[withData.length - 1]?.savingsRate ?? 0;
  const rateColor =
    currentRate >= 20 ? Colors.semantic.success :
    currentRate >= 10 ? Colors.semantic.warning :
    Colors.semantic.danger;

  return (
    <PageSection title="Andamento 6 mesi">
      {/* Trend spese */}
      <Card padding={10} style={{ alignItems: 'center', gap: 8 }}>
        <View style={s.chartHeader}>
          <Ionicons name="trending-up" size={14} color={Colors.accent.primary} />
          <Text style={s.chartTitle}>Uscite mensili</Text>
        </View>
        <TrendLineChart snapshots={withData} />
      </Card>

      {/* Entrate vs Uscite */}
      <Card padding={10} style={{ alignItems: 'center', gap: 8 }}>
        <View style={s.chartHeader}>
          <Ionicons name="bar-chart" size={14} color={Colors.accent.primary} />
          <Text style={s.chartTitle}>Entrate vs Uscite</Text>
        </View>
        <IncomeExpenseBarChart snapshots={withData} />
        <View style={s.chartLegend}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: Colors.semantic.success }]} />
            <Text style={s.legendLabel}>Entrate</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: Colors.semantic.danger }]} />
            <Text style={s.legendLabel}>Uscite</Text>
          </View>
        </View>
      </Card>

      {/* Tasso di risparmio */}
      <Card padding={10} style={{ alignItems: 'center', gap: 8 }}>
        <View style={s.chartHeader}>
          <Ionicons name="leaf" size={14} color={rateColor} />
          <Text style={s.chartTitle}>Tasso di risparmio</Text>
          <Text style={[s.chartTitle, { color: rateColor, marginLeft: 'auto' }]}>
            {currentRate.toFixed(0)}%
          </Text>
        </View>
        <SavingsRateSparkline snapshots={withData} />
      </Card>
    </PageSection>
  );
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <View style={s.ringContainer}>
        <View style={[s.ringOuter, { borderColor: Colors.border.default }]}>
          <View style={[s.ringInner, { borderColor: Colors.border.default }]}>
            <Text style={[s.ringScore, { color: Colors.text.muted, fontSize: 13 }]}>—</Text>
          </View>
        </View>
        <Text style={[s.ringLabel, { color: Colors.text.muted }]}>Insufficienti</Text>
      </View>
    );
  }
  const color =
    score >= 70 ? Colors.semantic.success :
    score >= 50 ? Colors.semantic.warning :
    Colors.semantic.danger;
  const label =
    score >= 70 ? 'Ottimo' :
    score >= 50 ? 'Da migliorare' :
    'Attenzione';
  return (
    <View style={s.ringContainer}>
      <View style={[s.ringOuter, { borderColor: color + '28' }]}>
        <View style={[s.ringInner, { borderColor: color }]}>
          <View style={s.ringScoreRow}>
            <Text style={[s.ringScore, { color }]}>{score}</Text>
            <Text style={s.ringMax}>/100</Text>
          </View>
        </View>
      </View>
      <Text style={[s.ringLabel, { color }]}>{label}</Text>
    </View>
  );
}

// ── Category analysis card ────────────────────────────────────────────────────

function CategoryCard({ ca, totalExpenses }: { ca: CategoryAnalysis; totalExpenses: number }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor =
    ca.status === 'over' ? Colors.semantic.danger :
    ca.status === 'warning' ? Colors.semantic.warning :
    ca.status === 'ok' ? Colors.semantic.success :
    Colors.text.muted;

  const statusLabel =
    ca.status === 'over' ? `Superato ${Math.round(ca.budgetProgress * 100)}%` :
    ca.status === 'warning' ? `Attenzione ${Math.round(ca.budgetProgress * 100)}%` :
    ca.status === 'ok' ? 'Nella norma' :
    'Nessun budget';

  const trendIcon = ca.vsLastMonth > 5 ? 'trending-up' : ca.vsLastMonth < -5 ? 'trending-down' : 'remove';
  const trendColor = ca.vsLastMonth > 5 ? Colors.semantic.danger : ca.vsLastMonth < -5 ? Colors.semantic.success : Colors.text.muted;

  const pctOfTotal = totalExpenses > 0 ? (ca.monthTotal / totalExpenses * 100).toFixed(0) : '0';
  const avgPerTx = ca.txCount > 0 ? (ca.monthTotal / ca.txCount).toFixed(0) : '0';

  // Top 5 largest transactions for the expanded detail
  const topTx = useMemo(() => {
    return [...ca.monthTx]
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 5);
  }, [ca.monthTx]);

  return (
    <TouchableOpacity
      style={[s.catCard, ca.status === 'over' && s.catCardOver]}
      activeOpacity={0.7}
      onPress={() => setExpanded((v) => !v)}
    >
      {/* Header row */}
      <View style={s.catRow}>
        <View style={[s.catIconWrap, { backgroundColor: ca.bgColor }]}>
          <Ionicons name={ca.icon as any} size={18} color={ca.color} />
        </View>
        <View style={s.catInfo}>
          <Text style={s.catLabel}>{ca.label}</Text>
          <View style={s.catAmountRow}>
            <Text style={s.catAmount}>€{ca.monthTotal.toFixed(0)}</Text>
            {ca.budgetLimit > 0 && (
              <Text style={s.catBudget}> / €{ca.budgetLimit}</Text>
            )}
            <Text style={s.catPct}> · {pctOfTotal}% uscite</Text>
          </View>
        </View>
        <View style={s.catRight}>
          <View style={[s.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {ca.vsLastMonth !== 0 && ca.prevMonthTotal > 0 && (
            <View style={s.trendRow}>
              <Ionicons name={trendIcon} size={11} color={trendColor} />
              <Text style={[s.trendText, { color: trendColor }]}>
                {ca.vsLastMonth > 0 ? '+' : ''}{Math.round(ca.vsLastMonth)}%
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Budget bar */}
      {ca.budgetLimit > 0 && (
        <View style={s.barBg}>
          <View
            style={[
              s.barFill,
              {
                width: `${Math.min(100, ca.budgetProgress * 100)}%` as any,
                backgroundColor: statusColor,
              },
            ]}
          />
        </View>
      )}

      {/* Merchant chips — always visible */}
      {ca.topMerchants.length > 0 && (
        <View style={s.merchantRow}>
          {ca.topMerchants.slice(0, expanded ? 5 : 3).map((m) => (
            <View key={m.name} style={[s.merchantChip, { borderLeftColor: ca.color }]}>
              <Text style={s.merchantName} numberOfLines={1}>{m.name}</Text>
              <Text style={s.merchantAmount}>€{m.total.toFixed(0)}</Text>
              <Text style={s.merchantCount}>{m.count}×</Text>
            </View>
          ))}
        </View>
      )}

      {/* Expanded details */}
      {expanded && (
        <View style={s.expandedSection}>

          {/* Quick stats row */}
          <View style={s.expandedStats}>
            <View style={s.expandedStat}>
              <Text style={s.expandedStatValue}>{ca.txCount}</Text>
              <Text style={s.expandedStatLabel}>transazioni</Text>
            </View>
            <View style={s.expandedStatDiv} />
            <View style={s.expandedStat}>
              <Text style={s.expandedStatValue}>€{avgPerTx}</Text>
              <Text style={s.expandedStatLabel}>media/spesa</Text>
            </View>
            <View style={s.expandedStatDiv} />
            <View style={s.expandedStat}>
              <Text style={s.expandedStatValue}>{ca.uniqueDays}</Text>
              <Text style={s.expandedStatLabel}>giorni attivi</Text>
            </View>
            {ca.prevMonthTotal > 0 && (
              <>
                <View style={s.expandedStatDiv} />
                <View style={s.expandedStat}>
                  <Text style={[s.expandedStatValue, { color: trendColor }]}>
                    {ca.vsLastMonth > 0 ? '+' : ''}{Math.round(ca.vsLastMonth)}%
                  </Text>
                  <Text style={s.expandedStatLabel}>vs mese prec.</Text>
                </View>
              </>
            )}
          </View>

          {/* Weekend vs weekday */}
          {ca.weekendTotal > 0 && ca.weekdayTotal > 0 && (
            <View style={s.splitRow}>
              <View style={s.splitItem}>
                <View style={[s.splitBar, { backgroundColor: ca.color + '30' }]}>
                  <View
                    style={[
                      s.splitBarFill,
                      {
                        width: `${(ca.weekendTotal / (ca.weekendTotal + ca.weekdayTotal)) * 100}%` as any,
                        backgroundColor: ca.color,
                      },
                    ]}
                  />
                </View>
                <View style={s.splitLabels}>
                  <Text style={s.splitLabelText}>Weekend</Text>
                  <Text style={s.splitLabelValue}>€{ca.weekendTotal.toFixed(0)}</Text>
                </View>
              </View>
              <View style={s.splitItem}>
                <View style={[s.splitBar, { backgroundColor: Colors.text.muted + '20' }]}>
                  <View
                    style={[
                      s.splitBarFill,
                      {
                        width: `${(ca.weekdayTotal / (ca.weekendTotal + ca.weekdayTotal)) * 100}%` as any,
                        backgroundColor: Colors.text.muted,
                      },
                    ]}
                  />
                </View>
                <View style={s.splitLabels}>
                  <Text style={s.splitLabelText}>Feriali</Text>
                  <Text style={s.splitLabelValue}>€{ca.weekdayTotal.toFixed(0)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Top transactions */}
          {topTx.length > 0 && (
            <View style={s.txSection}>
              <Text style={s.txSectionTitle}>SPESE MAGGIORI</Text>
              {topTx.map((t, i) => (
                <View key={t.id} style={[s.txRow, i < topTx.length - 1 && s.txRowBorder]}>
                  <View style={s.txInfo}>
                    <Text style={s.txDesc} numberOfLines={1}>
                      {t.merchant || t.description}
                    </Text>
                    <Text style={s.txDate}>{t.date}</Text>
                  </View>
                  <Text style={s.txAmount}>€{Math.abs(t.amount).toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Recurring */}
          {ca.recurringItems.length > 0 && (
            <View style={s.recurringSection}>
              <Text style={s.txSectionTitle}>RICORRENTI RILEVATI</Text>
              {ca.recurringItems.map((r) => (
                <View key={r.description} style={s.recurringRow}>
                  <Ionicons name="repeat" size={13} color={Colors.accent.primary} />
                  <Text style={s.recurringDesc} numberOfLines={1}>{r.description}</Text>
                  <Text style={s.recurringAmt}>~€{r.amount.toFixed(0)}/mese</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Chevron */}
      <View style={s.chevronRow}>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={Colors.text.muted}
        />
      </View>
    </TouchableOpacity>
  );
}

// ── Question card ─────────────────────────────────────────────────────────────

interface QuestionCardProps {
  question: CoachQuestion;
  onAnswer: (tag: string, rec: CoachRecommendation) => void;
  onDismiss: () => void;
}

function QuestionCard({ question, onAnswer, onDismiss }: QuestionCardProps) {
  return (
    <AccentCard padding={18} style={{ gap: 12 }}>
      <View style={s.questionHeader}>
        <View style={[s.questionIconWrap, { backgroundColor: question.iconColor + '20' }]}>
          <Ionicons name={question.icon as any} size={20} color={question.iconColor} />
        </View>
        <View style={s.questionTitleWrap}>
          <Text style={s.questionTitle}>{question.title}</Text>
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={18} color={Colors.text.muted} />
        </TouchableOpacity>
      </View>
      <Text style={s.questionBody}>{question.body}</Text>
      <View style={s.optionList}>
        {question.options.map((opt) => (
          <TouchableOpacity
            key={opt.tag}
            style={s.optionBtn}
            activeOpacity={0.7}
            onPress={() => onAnswer(opt.tag, opt.recommendation)}
          >
            <Text style={s.optionLabel}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </AccentCard>
  );
}

// ── Recommendation card ───────────────────────────────────────────────────────

function RecommendationCard({
  rec,
  onNext,
  analysisMonth,
  questionIdx,
  questionsLength,
}: {
  rec: CoachRecommendation;
  onNext: () => void;
  analysisMonth: string;
  questionIdx: number;
  questionsLength: number;
}) {
  const accentColor =
    rec.type === 'positive' ? Colors.semantic.success :
    rec.type === 'action' ? Colors.accent.primary :
    Colors.semantic.warning;

  const monthLabel = new Date(analysisMonth + '-01').toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Card padding={18} style={{ gap: 12, borderColor: accentColor + '40' }}>
      <View style={s.recHeader}>
        <Ionicons
          name={rec.type === 'positive' ? 'checkmark-circle' : rec.type === 'action' ? 'bulb' : 'information-circle'}
          size={22}
          color={accentColor}
        />
        <Text style={[s.recTitle, { color: accentColor }]}>{rec.title}</Text>
      </View>
      <Text style={s.recBody}>{rec.body}</Text>
      {rec.potentialSaving != null && rec.potentialSaving > 0 && (
        <View style={s.savingBadge}>
          <Ionicons name="leaf" size={13} color={Colors.semantic.success} />
          <Text style={s.savingText}>Risparmio potenziale: €{rec.potentialSaving}/mese</Text>
        </View>
      )}
      <View style={s.recMeta}>
        <Text style={s.recMonthNote}>
          Basato sui dati di {monthLabel}
        </Text>
        {questionsLength > 3 && (
          <Text style={s.recCounter}>
            Domanda {questionIdx + 1} di {questionsLength}
          </Text>
        )}
      </View>
      <TouchableOpacity style={s.nextBtn} onPress={onNext} activeOpacity={0.7}>
        <Text style={s.nextBtnText}>Prossima domanda →</Text>
      </TouchableOpacity>
    </Card>
  );
}

// ── Budget Forecast Card ──────────────────────────────────────────────────────

function BudgetForecastCard({ forecasts }: { forecasts: BudgetForecast[] }) {
  const top = forecasts.filter((f) => f.status === 'at_risk' || f.status === 'over_pace').slice(0, 3);
  if (top.length === 0) return null;

  return (
    <PageSection title="Previsioni budget">
      <Card padding={0} style={{ borderColor: Colors.semantic.warning + '40', overflow: 'hidden' }}>
        {top.map((f) => {
          const rowColor = f.status === 'over_pace' ? '#FF6B6B' : '#FFB347';
          return (
            <View key={f.category} style={[s.forecastRow, { borderLeftColor: rowColor }]}>
              <View style={s.forecastInfo}>
                <Text style={s.forecastLabel}>
                  <Ionicons name={f.icon as any} size={13} color={f.color} /> {f.label}
                </Text>
                <Text style={s.forecastBody}>
                  {f.daysUntilOverBudget !== null
                    ? `Sfori tra ${f.daysUntilOverBudget} giorni`
                    : `Proiezione: €${f.projectedEndOfMonth.toFixed(0)}`}
                </Text>
              </View>
              <Text style={[s.forecastPace, { color: rowColor }]}>
                {Math.round(f.paceRatio * 100)}%
              </Text>
            </View>
          );
        })}
      </Card>
    </PageSection>
  );
}

// ── Persistent Insights Panel ─────────────────────────────────────────────────

function PersistentInsightsPanel({ insights }: { insights: PersistentInsight[] }) {
  if (insights.length === 0) return null;

  return (
    <PageSection title="Situazione attuale">
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {insights.map((ins) => {
          const borderColor =
            ins.trend === 'positive' ? '#00D68F' :
            ins.trend === 'negative' ? '#FF6B6B' :
            '#FFB347';
          return (
            <View key={ins.id} style={[s.tipRow, { borderLeftColor: borderColor }]}>
              <View style={[s.tipIconWrap, { backgroundColor: ins.iconColor + '20' }]}>
                <Ionicons name={ins.icon as any} size={16} color={ins.iconColor} />
              </View>
              <View style={s.tipBody}>
                <Text style={s.tipTitle}>{ins.title}</Text>
                <Text style={s.tipText}>{ins.body}</Text>
              </View>
            </View>
          );
        })}
      </Card>
    </PageSection>
  );
}

// ── Unclassified Card ─────────────────────────────────────────────────────────

function UnclassifiedCard({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.semantic.warning + '10', borderColor: Colors.semantic.warning + '40' }}>
      <View style={s.unclassLeft}>
        <Text style={s.unclassTitle}>
          {count} {count === 1 ? 'spesa' : 'spese'} da classificare
        </Text>
        <Text style={s.unclassSub}>Riclassifica per migliorare le analisi future</Text>
      </View>
      <TouchableOpacity
        style={s.unclassBtn}
        activeOpacity={0.8}
        onPress={() => router.push('/(tabs)/spese')}
      >
        <Text style={s.unclassBtnText}>Classifica →</Text>
      </TouchableOpacity>
    </Card>
  );
}

// ── Coach TOC ─────────────────────────────────────────────────────────────────

function CoachToc({
  onPressCoach,
  onPressAnalisi,
}: {
  onPressCoach: () => void;
  onPressAnalisi: () => void;
}) {
  return (
    <View style={s.toc}>
      <View style={s.tocDivider} />
      <View style={s.tocPillRow}>
        <TouchableOpacity style={s.tocPill} onPress={onPressCoach} activeOpacity={0.7}>
          <Ionicons name="sparkles" size={12} color={Colors.accent.primary} />
          <Text style={s.tocPillLabel}>Coach</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tocPill, s.tocPillSecondary]} onPress={onPressAnalisi} activeOpacity={0.7}>
          <Ionicons name="analytics-outline" size={12} color={Colors.text.secondary} />
          <Text style={[s.tocPillLabel, { color: Colors.text.secondary }]}>Analisi dettagliata</Text>
        </TouchableOpacity>
      </View>
      <View style={s.tocDivider} />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CoachScreen() {
  const { transactions, budgets, insightProfile, answerQuestion, dismissQuestion } = useData();
  const { fiscalProfile } = useSettings();

  const { selectedMonth, availableMonths } = useAnalysis();

  const analysis = useMemo(
    () => analyzeSpending(transactions, budgets, selectedMonth),
    [transactions, budgets, selectedMonth],
  );

  const questions = useMemo(
    () => generateCoachQuestions(analysis, insightProfile, selectedMonth),
    [analysis, insightProfile, selectedMonth],
  );

  const budgetForecasts = useMemo(() => getBudgetForecast(budgets, transactions), [budgets, transactions]);

  const currentMonthTx = useMemo(
    () => transactions.filter((t) => t.date.startsWith(selectedMonth)),
    [transactions, selectedMonth],
  );

  const anomalies = useMemo(
    () => detectAnomalies(currentMonthTx, insightProfile, budgets),
    [currentMonthTx, insightProfile, budgets],
  );

  const persistentInsights = useMemo(
    () => generatePersistentInsights(analysis, insightProfile, anomalies),
    [analysis, insightProfile, anomalies],
  );
  const taxInsights = useMemo(
    () => generateTaxInsights(fiscalProfile, transactions),
    [fiscalProfile, transactions],
  );
  const history = useMemo(() => analyzeHistory(transactions, budgets, 6), [transactions, budgets]);
  const unclassifiedCount = useMemo(
    () => currentMonthTx.filter((t) => t.category === 'other' && t.amount < 0).length,
    [currentMonthTx]
  );

  const scrollViewRef = useRef<ScrollView>(null);
  const analysisSectionY = useRef(0);

  const [questionIdx, setQuestionIdx] = useState(0);
  const [activeRec, setActiveRec] = useState<CoachRecommendation | null>(null);

  const activeQuestion = questions[questionIdx] ?? null;

  const handleAnswer = (questionId: string, tag: string, rec: CoachRecommendation) => {
    answerQuestion(questionId, tag);
    setActiveRec(rec);
  };

  const handleDismiss = (questionId: string) => {
    dismissQuestion(questionId);
    setActiveRec(null);
    setQuestionIdx((i) => Math.max(0, i - 1));
  };

  const handleNext = () => {
    setActiveRec(null);
    setQuestionIdx((i) => i + 1);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const visibleCategories = useMemo(() => {
    const withData = analysis.categories.filter((c) => c.monthTotal > 0);
    return [
      ...withData.filter((c) => c.status === 'over'),
      ...withData.filter((c) => c.status === 'warning'),
      ...withData.filter((c) => c.status === 'ok'),
      ...withData.filter((c) => c.status === 'nobudget'),
    ];
  }, [analysis]);

  const hasData = transactions.length > 0;

  const subtitle = hasData
    ? `Analisi di ${new Date(analysis.analysisMonth + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`
    : 'Analisi personalizzata';

  const aiChip = (
    <View style={s.aiChip}>
      <Ionicons name="sparkles" size={14} color={Colors.accent.primary} />
      <Text style={s.aiChipText}>AI</Text>
    </View>
  );

  return (
    <Page title="Coach AI" subtitle={subtitle} gap={20} rightAction={aiChip} scrollViewRef={scrollViewRef}>
      {/* Month selector */}
      <MonthSelectorStrip />

      {/* Score + factors — padding compacted */}
      <Card padding={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
        <ScoreRing score={analysis.score} />
        <View style={s.factorsWrap}>
          {analysis.score === null ? (
            <Text style={s.scoreInsufficient}>
              Dati insufficienti per calcolare lo score
            </Text>
          ) : (
            analysis.scoreFactors.map((f) => {
              const ptColor =
                f.points < 0 ? Colors.semantic.danger :
                f.points > 0 ? Colors.semantic.success :
                Colors.text.muted;
              return (
                <View key={f.label} style={s.factorRow}>
                  <Ionicons name={f.icon as any} size={13} color={ptColor} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.factorLabel}>{f.label}</Text>
                    {f.description && (
                      <Text style={s.factorDesc}>{f.description}</Text>
                    )}
                  </View>
                  <Text style={[s.factorPts, { color: ptColor }]}>
                    {f.points > 0 ? '+' : ''}{f.points}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </Card>

      {/* No data state */}
      {!hasData && (
        <Card padding={32} style={{ borderRadius: Radius.xl, alignItems: 'center', gap: 12 }}>
          <Ionicons name="analytics-outline" size={48} color={Colors.text.muted} />
          <Text style={s.emptyTitle}>Nessun dato disponibile</Text>
          <Text style={s.emptyBody}>
            Importa le tue transazioni per ricevere analisi dettagliate, domande personalizzate e consigli specifici sulle tue abitudini di spesa.
          </Text>
          <TouchableOpacity
            style={s.emptyBtn}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/importa')}
          >
            <Text style={s.emptyBtnText}>Importa Dati</Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* ── Sezione 1: Coach ─────────────────────────────────────────────── */}
      {hasData && (
        <SectionErrorBoundary label="Analisi Coach non disponibile">
          <>
            {/* Active question or recommendation */}
            {activeQuestion && !activeRec && (
              <PageSection
                iconName="chatbubble-ellipses"
                title="Domanda per te"
                rightLabel={questions.length > 1 ? `${questionIdx + 1}/${questions.length}` : undefined}
              >
                <QuestionCard
                  question={activeQuestion}
                  onAnswer={(tag, rec) => handleAnswer(activeQuestion.id, tag, rec)}
                  onDismiss={() => handleDismiss(activeQuestion.id)}
                />
              </PageSection>
            )}

            {activeRec && (
              <PageSection iconName="chatbubble-ellipses" title="Il mio consiglio">
                <RecommendationCard
                  rec={activeRec}
                  onNext={handleNext}
                  analysisMonth={analysis.analysisMonth}
                  questionIdx={questionIdx}
                  questionsLength={questions.length}
                />
              </PageSection>
            )}

            {!activeQuestion && !activeRec && questions.length === 0 && (
              <Card padding={20} style={{ borderColor: Colors.semantic.success + '30', alignItems: 'center', gap: 10 }}>
                <Ionicons name="checkmark-circle" size={32} color={Colors.semantic.success} />
                <Text style={s.allDoneTitle}>Tutto sotto controllo!</Text>
                <Text style={s.allDoneBody}>
                  Hai risposto a tutte le domande di questo mese. Importa i dati del mese prossimo per nuove analisi.
                </Text>
              </Card>
            )}

            <UnclassifiedCard count={unclassifiedCount} />
            <BudgetForecastCard forecasts={budgetForecasts} />
            <PersistentInsightsPanel insights={[...persistentInsights, ...taxInsights]} />

            {/* Summary stats bar */}
            <Card padding={12} style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={s.statItem}>
                <Text style={s.statValue}>€{analysis.totalExpenses.toFixed(0)}</Text>
                <Text style={s.statLabel}>Uscite</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={[
                  s.statValue,
                  { color: analysis.savingsRate >= 20 ? Colors.semantic.success : analysis.savingsRate >= 10 ? Colors.semantic.warning : Colors.semantic.danger }
                ]}>
                  {analysis.savingsRate.toFixed(0)}%
                </Text>
                <Text style={s.statLabel}>Risparmio</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={[s.statValue, { color: Colors.semantic.danger }]}>
                  {analysis.problemCategories.length}
                </Text>
                <Text style={s.statLabel}>Budget superati</Text>
              </View>
            </Card>

            {/* Monthly insights highlights */}
            {visibleCategories.length > 0 && (() => {
              const overBudget = [...analysis.problemCategories].sort((a, b) => b.budgetProgress - a.budgetProgress)[0];
              const bigIncrease = [...analysis.categories]
                .filter((c) => c.vsLastMonth > 30 && c.prevMonthTotal > 0 && c.monthTotal > 20)
                .sort((a, b) => b.vsLastMonth - a.vsLastMonth)[0];
              const bestSaving = [...analysis.categories]
                .filter((c) => c.vsLastMonth < -15 && c.prevMonthTotal > 0 && c.monthTotal > 0)
                .sort((a, b) => a.vsLastMonth - b.vsLastMonth)[0];
              const highlights = [overBudget, bigIncrease, bestSaving].filter(Boolean);
              if (highlights.length === 0) return null;
              return (
                <PageSection title="Highlights di questo mese">
                  <View style={s.highlightList}>
                    {overBudget && (
                      <View style={[s.highlightRow, { borderLeftColor: Colors.semantic.danger }]}>
                        <Ionicons name="alert-circle" size={16} color={Colors.semantic.danger} />
                        <View style={s.highlightInfo}>
                          <Text style={s.highlightLabel}>Categoria più sopra budget</Text>
                          <Text style={s.highlightValue}>
                            {overBudget.label}: {Math.round(overBudget.budgetProgress * 100)}% utilizzato
                          </Text>
                        </View>
                      </View>
                    )}
                    {bigIncrease && (
                      <View style={[s.highlightRow, { borderLeftColor: Colors.semantic.warning }]}>
                        <Ionicons name="trending-up" size={16} color={Colors.semantic.warning} />
                        <View style={s.highlightInfo}>
                          <Text style={s.highlightLabel}>Maggior aumento vs mese scorso</Text>
                          <Text style={s.highlightValue}>
                            {bigIncrease.label}: +{Math.round(bigIncrease.vsLastMonth)}%
                          </Text>
                        </View>
                      </View>
                    )}
                    {bestSaving && (
                      <View style={[s.highlightRow, { borderLeftColor: Colors.semantic.success }]}>
                        <Ionicons name="leaf" size={16} color={Colors.semantic.success} />
                        <View style={s.highlightInfo}>
                          <Text style={s.highlightLabel}>Maggior risparmio vs mese scorso</Text>
                          <Text style={s.highlightValue}>
                            {bestSaving.label}: {Math.round(bestSaving.vsLastMonth)}%
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </PageSection>
              );
            })()}
          </>
        </SectionErrorBoundary>
      )}

      {/* ── TOC pill row ──────────────────────────────────────────────────── */}
      {hasData && (
        <CoachToc
          onPressCoach={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
          onPressAnalisi={() => scrollViewRef.current?.scrollTo({ y: analysisSectionY.current, animated: true })}
        />
      )}

      {/* ── Sezione 2: Analisi dettagliata ───────────────────────────────── */}
      {hasData && (
        <View
          style={{ gap: 20 }}
          onLayout={(e) => { analysisSectionY.current = e.nativeEvent.layout.y; }}
        >
          <SectionErrorBoundary label="Analisi dettagliata non disponibile">
            <>
              <HistoryChartsSection snapshots={history} />

              {/* Category analysis */}
              {visibleCategories.length > 0 && (
                <PageSection title="Analisi per categoria" subtitle="Tocca per vedere le spese dettagliate">
                  <View style={s.catList}>
                    {visibleCategories.map((ca) => (
                      <CategoryCard
                        key={ca.category}
                        ca={ca}
                        totalExpenses={analysis.totalExpenses}
                      />
                    ))}
                  </View>
                </PageSection>
              )}
            </>
          </SectionErrorBoundary>
        </View>
      )}
    </Page>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // TOC pill row
  toc: { gap: 10 },
  tocDivider: { height: 1, backgroundColor: Colors.border.default },
  tocPillRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  tocPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent.glow,
    borderWidth: 1, borderColor: Colors.border.accent,
  },
  tocPillSecondary: {
    backgroundColor: Colors.bg.card,
    borderColor: Colors.border.default,
  },
  tocPillLabel: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '600' },

  // AI chip
  aiChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.accent.glow,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border.accent,
  },
  aiChipText: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '700' },

  // Score ring
  ringContainer: { alignItems: 'center', gap: 8 },
  ringOuter: {
    width: 92, height: 92, borderRadius: 46,
    borderWidth: 5, alignItems: 'center', justifyContent: 'center',
  },
  ringInner: {
    width: 74, height: 74, borderRadius: 37,
    borderWidth: 2.5, alignItems: 'center', justifyContent: 'center',
  },
  ringScoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  ringScore: { fontSize: 26, fontWeight: '800', letterSpacing: -1, lineHeight: 30 },
  ringMax: { fontSize: 11, fontWeight: '500', color: Colors.text.muted, marginBottom: 3 },
  ringLabel: { ...Typography.micro, fontWeight: '700' },
  factorsWrap: { flex: 1, gap: 10, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: Colors.border.default },
  factorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  factorLabel: { ...Typography.caption, color: Colors.text.secondary },
  factorDesc: { ...Typography.micro, color: Colors.text.muted, marginTop: 1 },
  factorPts: { ...Typography.caption, fontWeight: '700' },
  scoreInsufficient: { ...Typography.caption, color: Colors.text.muted, fontStyle: 'italic' },

  // Question card internals
  questionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  questionIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  questionTitleWrap: { flex: 1 },
  questionTitle: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  questionBody: { ...Typography.caption, color: Colors.text.secondary, lineHeight: 19 },
  optionList: { gap: 8 },
  optionBtn: {
    backgroundColor: Colors.bg.elevated, borderRadius: Radius.md,
    paddingHorizontal: 16, paddingVertical: 13,
    borderWidth: 1, borderColor: Colors.border.default,
  },
  optionLabel: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '600', textAlign: 'center' },

  // Recommendation card internals
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recTitle: { ...Typography.bodyMedium, fontWeight: '700', flex: 1 },
  recBody: { ...Typography.caption, color: Colors.text.secondary, lineHeight: 19 },
  savingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.semantic.success + '15',
    borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  savingText: { ...Typography.caption, color: Colors.semantic.success, fontWeight: '600' },
  recMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  recMonthNote: {
    ...Typography.micro,
    color: Colors.text.muted,
    fontStyle: 'italic',
    flex: 1,
  },
  recCounter: {
    ...Typography.micro,
    color: Colors.text.muted,
    fontWeight: '600',
  },
  nextBtn: {
    backgroundColor: Colors.accent.primary + '15',
    borderRadius: Radius.md, paddingVertical: 13,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.accent.primary + '40',
  },
  nextBtnText: { ...Typography.bodyMedium, color: Colors.accent.primary, fontWeight: '700' },

  // Stats bar internals
  statItem: { alignItems: 'center', gap: 3 },
  statValue: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  statLabel: { ...Typography.micro, color: Colors.text.secondary },
  statDivider: { width: 1, backgroundColor: Colors.border.default },

  // Category list
  catList: { gap: 10 },
  catCard: {
    backgroundColor: Colors.bg.card, borderRadius: Radius.lg,
    padding: 14, borderWidth: 1, borderColor: Colors.border.default, gap: 10,
  },
  catCardOver: { borderColor: Colors.semantic.danger + '50' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catInfo: { flex: 1, gap: 2 },
  catLabel: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },
  catAmountRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  catAmount: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  catBudget: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '400' },
  catPct: { ...Typography.caption, color: Colors.text.muted },
  catRight: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { ...Typography.micro, fontWeight: '700' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trendText: { ...Typography.micro, fontWeight: '600' },

  // Budget bar
  barBg: { height: 4, backgroundColor: Colors.border.default, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },

  // Merchant chips — FIXED: testo bianco leggibile, chip con border sinistro colorato
  merchantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  merchantChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border.default,
    borderLeftWidth: 3,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  merchantName: { ...Typography.micro, color: Colors.text.primary, maxWidth: 90, fontWeight: '500' },
  merchantAmount: { ...Typography.micro, color: Colors.text.primary, fontWeight: '700' },
  merchantCount: { ...Typography.micro, color: Colors.text.secondary },

  // Expanded section
  expandedSection: { gap: 12, paddingTop: 4 },

  // Quick stats in expanded
  expandedStats: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.md,
    padding: 12,
    justifyContent: 'space-around',
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  expandedStat: { alignItems: 'center', gap: 2 },
  expandedStatValue: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  expandedStatLabel: { ...Typography.micro, color: Colors.text.secondary },
  expandedStatDiv: { width: 1, backgroundColor: Colors.border.default },

  // Weekend vs weekday split
  splitRow: { flexDirection: 'row', gap: 8 },
  splitItem: { flex: 1, gap: 6 },
  splitBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  splitBarFill: { height: '100%', borderRadius: 3 },
  splitLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  splitLabelText: { ...Typography.micro, color: Colors.text.secondary },
  splitLabelValue: { ...Typography.micro, color: Colors.text.primary, fontWeight: '700' },

  // Top transactions list
  txSection: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border.subtle,
    overflow: 'hidden',
  },
  txSectionTitle: {
    ...Typography.micro,
    color: Colors.text.secondary,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 9,
  },
  txRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border.subtle },
  txInfo: { flex: 1, gap: 1, paddingRight: 8 },
  txDesc: { ...Typography.caption, color: Colors.text.primary, fontWeight: '500' },
  txDate: { ...Typography.micro, color: Colors.text.secondary },
  txAmount: { ...Typography.caption, color: Colors.text.primary, fontWeight: '700' },

  // Recurring
  recurringSection: {
    backgroundColor: Colors.accent.glow,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border.accent,
    overflow: 'hidden',
    paddingBottom: 6,
  },
  recurringRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  recurringDesc: { ...Typography.caption, color: Colors.text.primary, flex: 1, fontWeight: '500' },
  recurringAmt: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '700' },

  // Chevron
  chevronRow: { alignItems: 'center', marginTop: 2 },

  // Empty / all done text styles
  emptyTitle: { ...Typography.h3, color: Colors.text.primary },
  emptyBody: { ...Typography.caption, color: Colors.text.secondary, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 4, backgroundColor: Colors.accent.primary,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.lg,
  },
  emptyBtnText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '600' },
  allDoneTitle: { ...Typography.h3, color: Colors.text.primary },
  allDoneBody: { ...Typography.caption, color: Colors.text.secondary, textAlign: 'center', lineHeight: 20 },

  // Highlights
  highlightList: { gap: 8 },
  highlightRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md, padding: 12,
    borderWidth: 1, borderColor: Colors.border.default,
    borderLeftWidth: 3,
  },
  highlightInfo: { flex: 1, gap: 2 },
  highlightLabel: { ...Typography.micro, color: Colors.text.secondary },
  highlightValue: { ...Typography.caption, color: Colors.text.primary, fontWeight: '600' },

  // Budget Forecast internals
  forecastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  forecastInfo: { flex: 1, gap: 3 },
  forecastLabel: { ...Typography.caption, color: Colors.text.primary, fontWeight: '600' },
  forecastBody: { ...Typography.micro, color: Colors.text.secondary },
  forecastPace: { ...Typography.bodyMedium, fontWeight: '800' },

  // Persistent Insights Panel internals
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  tipIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  tipBody: { flex: 1, gap: 3 },
  tipTitle: { ...Typography.caption, color: Colors.text.primary, fontWeight: '700' },
  tipText: { ...Typography.micro, color: Colors.text.secondary, lineHeight: 16 },

  // Chart card internals
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'stretch',
  },
  chartTitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 16,
    alignSelf: 'flex-start',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    ...Typography.micro,
    color: Colors.text.secondary,
  },

  // Unclassified card internals
  unclassLeft: { flex: 1, gap: 3 },
  unclassTitle: { ...Typography.caption, color: Colors.semantic.warning, fontWeight: '700' },
  unclassSub: { ...Typography.micro, color: Colors.text.secondary },
  unclassBtn: {
    backgroundColor: Colors.semantic.warning,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  unclassBtnText: { ...Typography.caption, color: '#000', fontWeight: '700' },

});
