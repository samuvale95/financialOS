import React, { useMemo, useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Radius } from '../../constants/theme';
import { useData } from '../../contexts/DataContext';
import { analyzeSpending } from '../../utils/spendingAnalyzer';
import { generateCoachQuestions } from '../../utils/coachEngine';
import type { CategoryAnalysis } from '../../utils/spendingAnalyzer';
import type { CoachQuestion, CoachRecommendation } from '../../utils/coachEngine';

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
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
      {/* Outer glow ring */}
      <View style={[s.ringOuter, { borderColor: color + '28' }]}>
        {/* Inner solid ring */}
        <View style={[s.ringInner, { borderColor: color }]}>
          {/* Score row: number + /100 aligned at bottom */}
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

function CategoryCard({ ca }: { ca: CategoryAnalysis }) {
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
          <Text style={s.catAmount}>
            €{ca.monthTotal.toFixed(0)}
            {ca.budgetLimit > 0 && <Text style={s.catBudget}> / €{ca.budgetLimit}</Text>}
          </Text>
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

      {/* Top merchants — always visible if any */}
      {ca.topMerchants.length > 0 && (
        <View style={s.merchantRow}>
          {ca.topMerchants.slice(0, expanded ? 5 : 3).map((m) => (
            <View key={m.name} style={s.merchantChip}>
              <Text style={s.merchantName} numberOfLines={1}>{m.name}</Text>
              <Text style={s.merchantCount}>{m.count}x</Text>
            </View>
          ))}
        </View>
      )}

      {/* Expanded details */}
      {expanded && (
        <View style={s.expandedSection}>
          {ca.uniqueDays > 0 && (
            <Text style={s.expandedDetail}>
              <Text style={s.expandedDetailBold}>{ca.uniqueDays}</Text> giorni con spese ·{' '}
              <Text style={s.expandedDetailBold}>{ca.txCount}</Text> transazioni
            </Text>
          )}
          {ca.weekendTotal > 0 && ca.weekdayTotal > 0 && (
            <Text style={s.expandedDetail}>
              Weekend: <Text style={s.expandedDetailBold}>€{ca.weekendTotal.toFixed(0)}</Text> ·
              Feriali: <Text style={s.expandedDetailBold}>€{ca.weekdayTotal.toFixed(0)}</Text>
            </Text>
          )}
          {ca.recurringItems.length > 0 && (
            <View style={s.recurringList}>
              <Text style={s.recurringTitle}>Ricorrenti rilevati:</Text>
              {ca.recurringItems.map((r) => (
                <Text key={r.description} style={s.recurringItem}>
                  · {r.description} — €{r.amount.toFixed(0)}/mese
                </Text>
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
    <View style={s.questionCard}>
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
    </View>
  );
}

// ── Recommendation card ───────────────────────────────────────────────────────

function RecommendationCard({
  rec,
  onNext,
}: {
  rec: CoachRecommendation;
  onNext: () => void;
}) {
  const accentColor =
    rec.type === 'positive' ? Colors.semantic.success :
    rec.type === 'action' ? Colors.accent.primary :
    Colors.semantic.warning;

  return (
    <View style={[s.recCard, { borderColor: accentColor + '40' }]}>
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
          <Text style={s.savingText}>
            Risparmio potenziale: €{rec.potentialSaving}/mese
          </Text>
        </View>
      )}
      <TouchableOpacity style={s.nextBtn} onPress={onNext} activeOpacity={0.7}>
        <Text style={s.nextBtnText}>Prossima domanda →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CoachScreen() {
  const { transactions, budgets, insightProfile, answerQuestion, dismissQuestion } = useData();

  const analysis = useMemo(
    () => analyzeSpending(transactions, budgets),
    [transactions, budgets],
  );

  const questions = useMemo(
    () => generateCoachQuestions(analysis, insightProfile),
    [analysis, insightProfile],
  );

  // Active question index (cycles through available questions)
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
  };

  // Visible categories: over + warning first, then any with data
  const visibleCategories = useMemo(() => {
    const withData = analysis.categories.filter((c) => c.monthTotal > 0);
    const sorted = [
      ...withData.filter((c) => c.status === 'over'),
      ...withData.filter((c) => c.status === 'warning'),
      ...withData.filter((c) => c.status === 'ok'),
      ...withData.filter((c) => c.status === 'nobudget'),
    ];
    return sorted;
  }, [analysis]);

  const hasData = transactions.length > 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Coach AI</Text>
            <Text style={s.subtitle}>
              {hasData
                ? `Analisi ${analysis.analysisMonth.replace('-', '/')}`
                : 'Analisi personalizzata'}
            </Text>
          </View>
          <View style={s.aiChip}>
            <Ionicons name="sparkles" size={14} color={Colors.accent.primary} />
            <Text style={s.aiChipText}>AI</Text>
          </View>
        </View>

        {/* Score + factors */}
        <View style={s.scoreCard}>
          <ScoreRing score={analysis.score} />
          <View style={s.factorsWrap}>
            {analysis.scoreFactors.map((f) => (
              <View key={f.label} style={s.factorRow}>
                <Ionicons
                  name={f.icon as any}
                  size={13}
                  color={f.points < 0 ? Colors.semantic.danger : f.points > 0 ? Colors.semantic.success : Colors.text.muted}
                />
                <Text style={s.factorLabel}>{f.label}</Text>
                <Text
                  style={[
                    s.factorPts,
                    {
                      color:
                        f.points < 0 ? Colors.semantic.danger :
                        f.points > 0 ? Colors.semantic.success :
                        Colors.text.muted,
                    },
                  ]}
                >
                  {f.points > 0 ? '+' : ''}{f.points}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* No data state */}
        {!hasData && (
          <View style={s.emptyCard}>
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
          </View>
        )}

        {/* Active question or recommendation */}
        {hasData && (
          <>
            {activeQuestion && !activeRec && (
              <View>
                <View style={s.sectionHeader}>
                  <Ionicons name="chatbubble-ellipses" size={16} color={Colors.accent.primary} />
                  <Text style={s.sectionTitle}>Domanda per te</Text>
                  {questions.length > 1 && (
                    <Text style={s.questionCounter}>{questionIdx + 1}/{questions.length}</Text>
                  )}
                </View>
                <QuestionCard
                  question={activeQuestion}
                  onAnswer={(tag, rec) => handleAnswer(activeQuestion.id, tag, rec)}
                  onDismiss={() => handleDismiss(activeQuestion.id)}
                />
              </View>
            )}

            {activeRec && (
              <View>
                <View style={s.sectionHeader}>
                  <Ionicons name="chatbubble-ellipses" size={16} color={Colors.accent.primary} />
                  <Text style={s.sectionTitle}>Il mio consiglio</Text>
                </View>
                <RecommendationCard rec={activeRec} onNext={handleNext} />
              </View>
            )}

            {!activeQuestion && !activeRec && questions.length === 0 && (
              <View style={s.allDoneCard}>
                <Ionicons name="checkmark-circle" size={32} color={Colors.semantic.success} />
                <Text style={s.allDoneTitle}>Tutto sotto controllo!</Text>
                <Text style={s.allDoneBody}>
                  Hai risposto a tutte le domande di questo mese. Importa i dati del mese prossimo per nuove analisi.
                </Text>
              </View>
            )}

            {/* Summary stats bar */}
            <View style={s.statsBar}>
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
            </View>

            {/* Category analysis */}
            {visibleCategories.length > 0 && (
              <View>
                <Text style={s.sectionTitlePlain}>Analisi per categoria</Text>
                <Text style={s.sectionSub}>Tocca una categoria per i dettagli</Text>
                <View style={s.catList}>
                  {visibleCategories.map((ca) => (
                    <CategoryCard key={ca.category} ca={ca} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 20 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { ...Typography.h1, color: Colors.text.primary },
  subtitle: { ...Typography.caption, color: Colors.text.secondary },
  aiChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.accent.glow,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border.accent,
  },
  aiChipText: { ...Typography.caption, color: Colors.accent.primary, fontWeight: '700' },

  // Score card
  scoreCard: {
    backgroundColor: Colors.bg.card, borderRadius: Radius.lg, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 20,
    borderWidth: 1, borderColor: Colors.border.default,
  },
  ringContainer: { alignItems: 'center', gap: 8 },
  ringOuter: {
    width: 92, height: 92, borderRadius: 46,
    borderWidth: 5, alignItems: 'center', justifyContent: 'center',
  },
  ringInner: {
    width: 74, height: 74, borderRadius: 37,
    borderWidth: 2.5, alignItems: 'center', justifyContent: 'center',
  },
  ringScoreRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 1,
  },
  ringScore: { fontSize: 26, fontWeight: '800', letterSpacing: -1, lineHeight: 30 },
  ringMax: { fontSize: 11, fontWeight: '500', color: Colors.text.muted, marginBottom: 3 },
  ringLabel: { ...Typography.micro, fontWeight: '700' },
  factorsWrap: { flex: 1, gap: 10, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: Colors.border.default },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factorLabel: { ...Typography.caption, color: Colors.text.secondary, flex: 1 },
  factorPts: { ...Typography.caption, fontWeight: '700' },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { ...Typography.h3, color: Colors.text.primary, flex: 1 },
  sectionTitlePlain: { ...Typography.h3, color: Colors.text.primary, marginBottom: 4 },
  sectionSub: { ...Typography.caption, color: Colors.text.muted, marginBottom: 12 },
  questionCounter: { ...Typography.caption, color: Colors.text.muted },

  // Question card
  questionCard: {
    backgroundColor: Colors.bg.card, borderRadius: Radius.lg, padding: 18,
    borderWidth: 1, borderColor: Colors.border.accent, gap: 12,
  },
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

  // Recommendation card
  recCard: {
    backgroundColor: Colors.bg.card, borderRadius: Radius.lg, padding: 18,
    borderWidth: 1, gap: 12,
  },
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
  nextBtn: {
    backgroundColor: Colors.accent.primary + '15',
    borderRadius: Radius.md, paddingVertical: 13,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.accent.primary + '40',
  },
  nextBtnText: { ...Typography.bodyMedium, color: Colors.accent.primary, fontWeight: '700' },

  // Stats bar
  statsBar: {
    flexDirection: 'row', backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border.default,
    padding: 16, justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center', gap: 3 },
  statValue: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  statLabel: { ...Typography.micro, color: Colors.text.muted },
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
  catAmount: { ...Typography.bodyMedium, color: Colors.text.primary, fontWeight: '700' },
  catBudget: { ...Typography.caption, color: Colors.text.muted, fontWeight: '400' },
  catRight: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { ...Typography.micro, fontWeight: '700' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trendText: { ...Typography.micro, fontWeight: '600' },

  // Budget bar
  barBg: { height: 4, backgroundColor: Colors.border.default, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },

  // Merchants
  merchantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  merchantChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4,
  },
  merchantName: { ...Typography.micro, color: Colors.text.secondary, maxWidth: 100 },
  merchantCount: { ...Typography.micro, color: Colors.text.muted, fontWeight: '700' },

  // Expanded details
  expandedSection: { gap: 6, paddingTop: 4 },
  expandedDetail: { ...Typography.caption, color: Colors.text.muted },
  expandedDetailBold: { color: Colors.text.primary, fontWeight: '700' },
  recurringList: { gap: 3 },
  recurringTitle: { ...Typography.micro, color: Colors.text.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  recurringItem: { ...Typography.caption, color: Colors.text.secondary },
  chevronRow: { alignItems: 'center', marginTop: 2 },

  // Empty / all done
  emptyCard: {
    backgroundColor: Colors.bg.card, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border.default,
    padding: 32, alignItems: 'center', gap: 12,
  },
  emptyTitle: { ...Typography.h3, color: Colors.text.primary },
  emptyBody: { ...Typography.caption, color: Colors.text.secondary, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 4, backgroundColor: Colors.accent.primary,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.lg,
  },
  emptyBtnText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '600' },

  allDoneCard: {
    backgroundColor: Colors.bg.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.semantic.success + '30',
    padding: 20, alignItems: 'center', gap: 10,
  },
  allDoneTitle: { ...Typography.h3, color: Colors.text.primary },
  allDoneBody: { ...Typography.caption, color: Colors.text.secondary, textAlign: 'center', lineHeight: 20 },
});
