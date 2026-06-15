import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { expenseCategories, formatCurrency, getCycleStart, theme } from '../../constants/nestledger';
import type { BudgetPlan, Expense, HouseholdProfile, Member } from '../../lib/nestledger';
import DonutChart, { type DonutSlice } from '../ui/DonutChart';
import {
  analyzeSpending,
  BORROW_CATEGORY,
  type AnalysisPeriod,
  type CategoryAnalysis,
} from './analytics';

const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': '#5D7B6F',
  Transport: '#D99F89',
  'Housing & Rent': '#7E9CA8',
  Utilities: '#E1B45C',
  Groceries: '#8AB096',
  Clothing: '#C58BA8',
  Healthcare: '#D67C7C',
  Education: '#9B8BC5',
  Entertainment: '#6FB0C5',
  Other: '#A9A39A',
  [BORROW_CATEGORY]: '#B08968',
};
const colorFor = (key: string) => CATEGORY_COLORS[key] ?? '#A9A39A';
const iconFor = (key: string): any => {
  if (key === BORROW_CATEGORY) return 'swap-horizontal-outline';
  return expenseCategories.find((c) => c.key === key)?.icon ?? 'wallet-outline';
};

const REMAINING_KEY = 'Remaining';
const REMAINING_COLOR = '#7FC898';

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const fmtDate = (d: Date) => `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;

type Props = {
  visible: boolean;
  profile: HouseholdProfile | null;
  expenses: Expense[];
  plans: BudgetPlan[];
  members: Member[];
  currency: string;
  onClose: () => void;
};

function pickDefaultPlan(plans: BudgetPlan[]): BudgetPlan | null {
  if (plans.length === 0) return null;
  const now = Date.now();
  const containing = plans.find(
    (p) => new Date(p.start_date).getTime() <= now && new Date(p.end_date).getTime() >= now,
  );
  if (containing) return containing;
  return [...plans].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
  )[0];
}

export default function AnalyseScreen({
  visible,
  profile,
  expenses,
  plans,
  members,
  currency,
  onClose,
}: Props) {
  const fmt = useMemo(() => (v: number) => formatCurrency(v, currency), [currency]);
  const nameOf = useMemo(
    () => (id: string | null | undefined) =>
      (id && members.find((m) => m.user_id === id)?.user_profile?.name) || 'Family',
    [members],
  );

  const sortedPlans = useMemo(
    () =>
      [...plans].sort(
        (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
      ),
    [plans],
  );

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [detailCategory, setDetailCategory] = useState<string | null>(null);
  const [showWhoOwes, setShowWhoOwes] = useState(false);

  const selectedPlan = useMemo(() => {
    if (selectedPlanId) {
      const found = plans.find((p) => p.id === selectedPlanId);
      if (found) return found;
    }
    return pickDefaultPlan(plans);
  }, [selectedPlanId, plans]);

  const anchorDay = useMemo(
    () => (selectedPlan ? new Date(selectedPlan.start_date).getDate() : 1),
    [selectedPlan],
  );

  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);

  const cursorBounds = useMemo(() => {
    if (!selectedPlan) return null;
    const planExpenses = expenses.filter((e) => e.plan_id === selectedPlan.id);
    if (planExpenses.length === 0) {
      const start = new Date(selectedPlan.start_date);
      const now = new Date();
      const end = selectedPlan.end_date ? new Date(selectedPlan.end_date) : now;
      return {
        minCursor: { year: start.getFullYear(), month: start.getMonth() },
        maxCursor: { year: end.getFullYear(), month: end.getMonth() },
      };
    }
    let minYear = Infinity;
    let minMonth = Infinity;
    let maxYear = -Infinity;
    let maxMonth = -Infinity;
    for (const e of planExpenses) {
      const d = new Date(e.date);
      const y = d.getFullYear();
      const m = d.getMonth();
      if (y < minYear || (y === minYear && m < minMonth)) {
        minYear = y;
        minMonth = m;
      }
      if (y > maxYear || (y === maxYear && m > maxMonth)) {
        maxYear = y;
        maxMonth = m;
      }
    }
    return {
      minCursor: { year: minYear, month: minMonth },
      maxCursor: { year: maxYear, month: maxMonth },
    };
  }, [selectedPlan, expenses]);

  useEffect(() => {
    if (!selectedPlan) {
      setCursor(null);
      return;
    }
    const cs = getCycleStart(selectedPlan.start_date);
    const initialCursor = { year: cs.getFullYear(), month: cs.getMonth() };
    if (cursorBounds) {
      const { minCursor, maxCursor } = cursorBounds;
      const clamped = {
        year: Math.max(minCursor.year, Math.min(maxCursor.year, initialCursor.year)),
        month:
          initialCursor.year === maxCursor.year
            ? Math.min(initialCursor.month, maxCursor.month)
            : initialCursor.year === minCursor.year
            ? Math.max(initialCursor.month, minCursor.month)
            : initialCursor.month,
      };
      setCursor(clamped);
    } else {
      setCursor(initialCursor);
    }
    setActiveKey(null);
  }, [selectedPlan, cursorBounds]);

  const cycle = useMemo(() => {
    if (!cursor) return null;
    const start = new Date(cursor.year, cursor.month, anchorDay, 0, 0, 0, 0);
    const nextAnchor = new Date(cursor.year, cursor.month + 1, anchorDay, 0, 0, 0, 0);
    const end = new Date(nextAnchor.getTime() - 1);
    const prevAnchor = new Date(cursor.year, cursor.month - 1, anchorDay, 0, 0, 0, 0);
    return { start, end, nextAnchor, prevAnchor };
  }, [cursor, anchorDay]);

  const period: AnalysisPeriod | null = cycle ? { start: cycle.start, end: cycle.end } : null;
  const priorRange = cycle ? { start: cycle.prevAnchor, end: new Date(cycle.start.getTime() - 1) } : undefined;

  const analysis = useMemo(() => {
    if (!period) return null;
    return analyzeSpending({
      expenses,
      period,
      priorRange,
      planTotal: selectedPlan?.total_amount ?? null,
      formatMoney: fmt,
    });
  }, [period, priorRange, expenses, selectedPlan, fmt]);

  const cycleExpenses = useMemo(() => {
    if (!period) return [];
    const s = period.start.getTime();
    const e = period.end.getTime();
    return expenses.filter((x) => {
      const t = new Date(x.date).getTime();
      return Number.isFinite(t) && t >= s && t <= e;
    });
  }, [expenses, period]);

  const whoOwes = useMemo(() => {
    const byUser = new Map<string, number>();
    for (const x of cycleExpenses) {
      if (!x.is_borrow) continue;
      const uid = x.used_by ?? x.added_by;
      byUser.set(uid, (byUser.get(uid) ?? 0) + (Number(x.price) || 0));
    }
    return [...byUser.entries()]
      .map(([uid, net]) => ({ uid, net: Math.round(net * 100) / 100 }))
      .filter((r) => r.net > 0)
      .sort((a, b) => b.net - a.net);
  }, [cycleExpenses]);

  const outstandingTotal = useMemo(
    () => Math.round(whoOwes.reduce((a, r) => a + r.net, 0) * 100) / 100,
    [whoOwes],
  );

  const detailRows = useMemo(() => {
    if (!detailCategory) return [];
    const rows = cycleExpenses.filter((x) =>
      detailCategory === BORROW_CATEGORY ? x.is_borrow : !x.is_borrow && (x.category || 'Other') === detailCategory,
    );
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [detailCategory, cycleExpenses]);

  const totalSpent = analysis?.totalSpent ?? 0;
  const planTotal = selectedPlan?.total_amount ?? null;
  const remaining = planTotal != null ? Math.round((planTotal - totalSpent) * 100) / 100 : null;

  const slices: DonutSlice[] = useMemo(() => {
    if (!analysis) return [];
    const categorySlices = analysis.categories
    // return analysis.categories
      .filter((c) => c.spent > 0)
      .map((c) => ({ key: c.category, value: c.spent, color: colorFor(c.category) }));

      // Add remaining slice if budget exists and there's remaining
      if(planTotal != null && remaining != null && remaining >0) {
        categorySlices.push({key: REMAINING_KEY, value: remaining, color: REMAINING_COLOR});
      }
      return categorySlices;
  }, [analysis,planTotal,remaining]);

  const stepCycle = (delta: number) => {
    setCursor((cur) => {
      if (!cur || !cursorBounds) return cur;
      const d = new Date(cur.year, cur.month + delta, 1);
      const next = { year: d.getFullYear(), month: d.getMonth() };
      const { minCursor, maxCursor } = cursorBounds;
      if (next.year < minCursor.year || (next.year === minCursor.year && next.month < minCursor.month)) {
        return minCursor;
      }
      if (next.year > maxCursor.year || (next.year === maxCursor.year && next.month > maxCursor.month)) {
        return maxCursor;
      }
      return next;
    });
    setActiveKey(null);
  };

  if (!visible) return null;

 
  const visibleCategories = analysis ? analysis.categories.filter((c) => c.spent > 0) : [];
  const cycleLabel = cycle ? `${fmtDate(cycle.start)} – ${fmtDate(cycle.nextAnchor)}` : '';

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable hitSlop={10} onPress={onClose} testID="analyse-close">
            <Ionicons name="chevron-down" size={26} color={theme.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Spending Report</Text>
          <View style={{ width: 26 }} />
        </View>

        {!selectedPlan || !period ? (
          <View style={styles.centerFill}>
            <Text style={styles.emptyText}>
              No budget plan yet. Create a budget to see its spending report.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {sortedPlans.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.planRow}
              >
                {sortedPlans.map((p) => {
                  const active = p.id === selectedPlan.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setSelectedPlanId(p.id)}
                      style={[styles.planChip, active && styles.planChipActive]}
                    >
                      <Text style={[styles.planChipText, active && styles.planChipTextActive]}>
                        {p.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Cycle stepper */}
            <View style={styles.cycleRow}>
              {cursorBounds && cursor ? (
                <>
                  <Pressable
                    hitSlop={12}
                    onPress={() => stepCycle(-1)}
                    testID="cycle-prev"
                    disabled={
                      cursor.year === cursorBounds.minCursor.year &&
                      cursor.month === cursorBounds.minCursor.month
                    }
                    style={
                      cursor.year === cursorBounds.minCursor.year &&
                      cursor.month === cursorBounds.minCursor.month
                        ? styles.navButtonDisabled
                        : undefined
                    }
                  >
                    <Ionicons
                      name="chevron-back"
                      size={22}
                      color={
                        cursor.year === cursorBounds.minCursor.year &&
                        cursor.month === cursorBounds.minCursor.month
                          ? theme.textMuted
                          : theme.text
                      }
                    />
                  </Pressable>
                  <Text style={styles.cycleLabel}>{cycleLabel}</Text>
                  <Pressable
                    hitSlop={12}
                    onPress={() => stepCycle(1)}
                    testID="cycle-next"
                    disabled={
                      cursor.year === cursorBounds.maxCursor.year &&
                      cursor.month === cursorBounds.maxCursor.month
                    }
                    style={
                      cursor.year === cursorBounds.maxCursor.year &&
                      cursor.month === cursorBounds.maxCursor.month
                        ? styles.navButtonDisabled
                        : undefined
                    }
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={22}
                      color={
                        cursor.year === cursorBounds.maxCursor.year &&
                        cursor.month === cursorBounds.maxCursor.month
                          ? theme.textMuted
                          : theme.text
                      }
                    />
                  </Pressable>
                </>
              ) : (
                <Text style={styles.cycleLabel}>{cycleLabel}</Text>
              )}
            </View>

            {/* Headline */}
            <View style={styles.headline}>
              <Text style={styles.planName}>{selectedPlan.name}</Text>
              <Text style={styles.headlineSpent}>{fmt(totalSpent)}</Text>
              <Text style={styles.headlineSub}>
                spent{planTotal != null ? ` of ${fmt(planTotal)}` : ''}
              </Text>
              {remaining != null && remaining >= 0 && (
                <View style={styles.remainingPill}>
                  <Text style={styles.remainingText}>{fmt(remaining)} remaining</Text>
                </View>
              )}
              {remaining != null && remaining < 0 && (
                <Text style={styles.overText}>{fmt(Math.abs(remaining))} over budget</Text>
              )}
            </View>

            {/* Donut */}
            {slices.length > 0 ? (
              <View style={styles.chartWrap}>
                <DonutChart
                  slices={slices}
                  activeKey={activeKey}
                  onSlicePress={(k) => setActiveKey((cur) => (cur === k ? null : k))}
                  centerLabel={fmt(totalSpent)}
                  centerSubLabel="spent"
                  testID="analyse-donut"
                />
              </View>
            ) : (
              <View style={styles.centerFill}>
                <Text style={styles.emptyText}>No expenses recorded for this cycle.</Text>
              </View>
            )}

            {/* Outstanding borrows */}
            {outstandingTotal > 0 && (
              <Pressable
                style={styles.borrowCard}
                onPress={() => setShowWhoOwes(true)}
                testID="open-who-owes"
              >
                <Ionicons name="swap-horizontal-outline" size={20} color={theme.secondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.borrowTitle}>Outstanding borrows</Text>
                  <Text style={styles.borrowSub}>Tap to see who owes</Text>
                </View>
                <Text style={styles.borrowAmount}>{fmt(outstandingTotal)}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </Pressable>
            )}

            {/* Insights */}
            {analysis && analysis.recommendations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Insights</Text>
                {analysis.recommendations.map((r) => (
                  <View
                    key={r.id}
                    style={[
                      styles.recCard,
                      {
                        borderLeftColor:
                          r.severity === 'high'
                            ? theme.danger
                            : r.severity === 'medium'
                            ? theme.warning
                            : theme.success,
                      },
                    ]}
                  >
                    <Text style={styles.recText}>{r.message}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Category breakdown (only categories with spending) */}
            {visibleCategories.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>By category</Text>
                <Text style={styles.sectionHint}>Tap a category for details</Text>
                {visibleCategories.map((c) => (
                  <CategoryRow
                    key={c.category}
                    item={c}
                    fmt={fmt}
                    dimmed={activeKey != null && activeKey !== c.category}
                    onPress={() => setDetailCategory(c.category)}
                  />
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}

        {/* Category detail popup */}
        <Modal
          transparent
          animationType="fade"
          visible={detailCategory != null}
          onRequestClose={() => setDetailCategory(null)}
        >
          <Pressable style={styles.backdrop} onPress={() => setDetailCategory(null)}>
            <Pressable style={styles.popup} onPress={() => undefined}>
              <View style={styles.popupHeader}>
                <Text style={styles.popupTitle} numberOfLines={1}>{detailCategory ?? ''}</Text>
                <Pressable hitSlop={10} onPress={() => setDetailCategory(null)}>
                  <Ionicons name="close" size={20} color={theme.textMuted} />
                </Pressable>
              </View>
              {detailRows.length === 0 ? (
                <Text style={styles.popupEmpty}>No items in this category this cycle.</Text>
              ) : (
                <ScrollView style={styles.popupScroll}>
                  {detailRows.map((x) => {
                    const isRepay = x.is_borrow && Number(x.price) < 0;
                    const who = x.is_borrow ? nameOf(x.used_by ?? x.added_by) : nameOf(x.paid_by);
                    const label =
                      x.description || (isRepay ? 'Repayment' : x.is_borrow ? 'Borrowed' : x.category);
                    return (
                      <View key={x.id} style={styles.detailRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.detailName} numberOfLines={1}>{label}</Text>
                          <Text style={styles.detailMeta}>{fmtDate(new Date(x.date))} · {who}</Text>
                        </View>
                        <Text style={[styles.detailAmount, isRepay && { color: theme.success }]}>
                          {fmt(Number(x.price) || 0)}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Who owes popup */}
        <Modal
          transparent
          animationType="fade"
          visible={showWhoOwes}
          onRequestClose={() => setShowWhoOwes(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setShowWhoOwes(false)}>
            <Pressable style={styles.popup} onPress={() => undefined}>
              <View style={styles.popupHeader}>
                <Text style={styles.popupTitle}>Who owes</Text>
                <Pressable hitSlop={10} onPress={() => setShowWhoOwes(false)}>
                  <Ionicons name="close" size={20} color={theme.textMuted} />
                </Pressable>
              </View>
              {whoOwes.length === 0 ? (
                <Text style={styles.popupEmpty}>Nothing outstanding this cycle.</Text>
              ) : (
                <ScrollView style={styles.popupScroll}>
                  {whoOwes.map((r) => (
                    <View key={r.uid} style={styles.detailRow}>
                      <Text style={styles.detailName}>{nameOf(r.uid)}</Text>
                      <Text style={styles.detailAmount}>{fmt(r.net)}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </Modal>
  );
}

function trendDisplay(item: CategoryAnalysis): { label: string; icon: any; color: string } | null {
  if (item.trend === 'new') {
    return { label: 'New', icon: 'sparkles-outline', color: theme.secondary };
  }
  if (item.trend === 'flat' || item.deltaPct === null) return null;
  const up = item.trend === 'up';
  const sign = up ? '+' : '';
  return {
    label: `${sign}${Math.round(item.deltaPct * 100)}%`,
    icon: up ? 'arrow-up' : 'arrow-down',
    color: up ? theme.danger : theme.success,
  };
}

function CategoryRow({
  item,
  fmt,
  dimmed,
  onPress,
}: {
  item: CategoryAnalysis;
  fmt: (v: number) => string;
  dimmed: boolean;
  onPress: () => void;
}) {
  const color = colorFor(item.category);
  const sharePct = Math.round(item.share * 100);
  const td = trendDisplay(item);
  return (
    <Pressable style={[styles.row, dimmed && { opacity: 0.45 }]} onPress={onPress}>
      <View style={[styles.rowDot, { backgroundColor: color }]} />
      <View style={styles.rowIcon}>
        <Ionicons name={iconFor(item.category)} size={16} color={theme.textMuted} />
      </View>
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName}>{item.category}</Text>
          <Text style={styles.rowAmount}>{fmt(item.spent)}</Text>
        </View>
        <View style={styles.shareTrack}>
          <View style={[styles.shareFill, { width: `${Math.max(sharePct, 2)}%`, backgroundColor: color }]} />
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.rowShare}>{sharePct}% of spending</Text>
          {td && (
            <View style={styles.rowMeta}>
              <Text style={[styles.rowTrend, { color: td.color }]}>{td.label}</Text>
              <Ionicons name={td.icon} size={13} color={td.color} />
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: theme.textMuted, textAlign: 'center', lineHeight: 20 },
  body: { paddingHorizontal: 20, paddingTop: 6 },
  planRow: { gap: 8, paddingBottom: 12 },
  planChip: {
    backgroundColor: theme.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  planChipActive: { backgroundColor: theme.primary },
  planChipText: { color: theme.textMuted, fontWeight: '600', fontSize: 13 },
  planChipTextActive: { color: theme.surface },
  cycleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 8,
  },
  cycleLabel: { fontSize: 15, fontWeight: '700', color: theme.text, minWidth: 150, textAlign: 'center' },
  navButtonDisabled: { opacity: 0.3 },
  headline: { alignItems: 'center', marginBottom: 4, marginTop: 6 },
  planName: { fontSize: 14, fontWeight: '600', color: theme.textMuted, marginBottom: 6 },
  headlineSpent: { fontSize: 30, fontWeight: '800', color: theme.text },
  headlineSub: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  remainingPill: {
    marginTop: 8,
    backgroundColor: '#E3F2E4',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  remainingText: { color: '#3F9B54', fontSize: 13, fontWeight: '700' },
  overText: { color: theme.danger, fontSize: 13, fontWeight: '700', marginTop: 8 },
  chartWrap: { alignItems: 'center', marginVertical: 16 },
  borrowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.secondarySoft,
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
  },
  borrowTitle: { color: theme.text, fontWeight: '700', fontSize: 14 },
  borrowSub: { color: theme.textMuted, fontSize: 12, marginTop: 1 },
  borrowAmount: { color: theme.text, fontWeight: '800', fontSize: 15 },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  sectionHint: { fontSize: 12, color: theme.textMuted, marginBottom: 10, marginTop: 2 },
  recCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 8,
  },
  recText: { color: theme.text, fontSize: 13, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  rowIcon: { width: 22, alignItems: 'center', marginRight: 4 },
  rowMain: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rowName: { fontSize: 14, fontWeight: '600', color: theme.text },
  rowAmount: { fontSize: 14, fontWeight: '700', color: theme.text },
  shareTrack: { height: 8, borderRadius: 999, backgroundColor: '#EDF0EB', overflow: 'hidden' },
  shareFill: { height: 8, borderRadius: 999 },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  rowShare: { fontSize: 11, color: theme.textMuted },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowTrend: { fontSize: 11, fontWeight: '600' },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  detailName: { fontSize: 14, fontWeight: '600', color: theme.text },
  detailMeta: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  detailAmount: { fontSize: 14, fontWeight: '700', color: theme.text, marginLeft: 12 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  popup: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: theme.background,
    borderRadius: 18,
    padding: 16,
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  popupTitle: { fontSize: 16, fontWeight: '700', color: theme.text, flex: 1, marginRight: 12 },
  popupScroll: { flexGrow: 0 },
  popupEmpty: { color: theme.textMuted, textAlign: 'center', paddingVertical: 24 },
});
