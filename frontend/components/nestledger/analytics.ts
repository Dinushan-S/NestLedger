/**
 * Spending analysis engine for the Analyse feature.
 *
 * Pure module — no React / React Native imports — so it is fully unit-testable.
 * The report is scoped to a monthly budget *cycle* (anchored to the plan's start
 * day, e.g. the 10th → 10th) supplied by the caller via `period`, with the trend
 * computed against an explicit previous cycle (`priorRange`).
 *
 * Borrows: a borrow is an `is_borrow` expense with a positive price (category
 * "Borrow"); a repayment is an `is_borrow` expense with a negative price
 * (category "Repay"). Raw Borrow/Repay rows are NOT shown as their own
 * categories — instead their signed sum within the period is the *outstanding
 * (unpaid) balance*, surfaced as a single "Borrowed" category (only when > 0).
 */

import { expenseCategories } from '../../constants/nestledger';
import type { Expense } from '../../lib/nestledger';

export const BORROW_CATEGORY = 'Borrowed';

export type Trend = 'up' | 'down' | 'flat' | 'new';

export interface AnalysisPeriod {
  start: Date;
  end: Date;
}

export interface CategoryAnalysis {
  category: string;
  spent: number;
  /** Share of total spent, 0..1. */
  share: number;
  count: number;
  priorSpent: number;
  /** (spent - prior) / prior, or null when prior is 0. */
  deltaPct: number | null;
  /** Absolute change vs the previous period. */
  deltaAmount: number;
  trend: Trend;
  /** 1 = biggest spender this period. */
  rank: number;
  isBorrow: boolean;
}

export type RecommendationType = 'total_breach' | 'top_spend' | 'rising' | 'on_budget';

export interface Recommendation {
  id: string;
  category: string | null;
  type: RecommendationType;
  severity: 'high' | 'medium' | 'low';
  amount: number;
  message: string;
}

export interface SpendingAnalysis {
  totalSpent: number;
  totalPriorSpent: number;
  planTotal: number | null;
  periodDays: number;
  categories: CategoryAnalysis[];
  recommendations: Recommendation[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FLAT_TREND_BAND = 0.05; // ±5% counts as "flat"
const RISING_THRESHOLD = 0.15; // +15% flags a rising category
const RISING_MIN_SHARE = 0.05; // only flag rising categories worth at least 5% of spend

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Inclusive number of calendar days between two dates (min 1). */
export function periodLengthDays(start: Date, end: Date): number {
  const d1 = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const d2 = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const diff = Math.round((d2 - d1) / MS_PER_DAY);
  return Math.max(1, diff + 1);
}

/** Filter expenses to [start, end] inclusive on the `date` field. */
export function filterExpensesByDate(expenses: Expense[], start: Date, end: Date): Expense[] {
  const s = start.getTime();
  const e = end.getTime();
  return expenses.filter((x) => {
    const t = new Date(x.date).getTime();
    return Number.isFinite(t) && t >= s && t <= e;
  });
}

/** Fallback previous window of equal length when an explicit one isn't supplied. */
export function priorPeriod(period: AnalysisPeriod): { start: Date; end: Date } {
  const days = periodLengthDays(period.start, period.end);
  const end = new Date(period.start.getTime() - 1); // 1ms before this window starts
  const start = new Date(period.start.getTime() - days * MS_PER_DAY);
  return { start, end };
}

function trendFor(spent: number, prior: number): { deltaPct: number | null; trend: Trend } {
  if (prior <= 0) {
    // No comparable spend last period: report as "new" rather than a misleading %.
    return { deltaPct: null, trend: spent > 0 ? 'new' : 'flat' };
  }
  const deltaPct = (spent - prior) / prior;
  if (deltaPct > FLAT_TREND_BAND) return { deltaPct, trend: 'up' };
  if (deltaPct < -FLAT_TREND_BAND) return { deltaPct, trend: 'down' };
  return { deltaPct, trend: 'flat' };
}

/**
 * Group expenses by category. Non-borrow rows group by their `category`. All
 * `is_borrow` rows are netted (borrowed − repaid) into a single BORROW_CATEGORY
 * entry, included only when the outstanding balance is positive.
 */
function buildGroups(expenses: Expense[]): Map<string, { spent: number; count: number }> {
  const map = new Map<string, { spent: number; count: number }>();
  let borrowNet = 0;
  let borrowCount = 0;
  for (const x of expenses) {
    const price = Number(x.price) || 0;
    if (x.is_borrow) {
      borrowNet += price; // borrows positive, repayments negative -> net = outstanding
      borrowCount += 1;
      continue;
    }
    const key = x.category || 'Other';
    const cur = map.get(key) ?? { spent: 0, count: 0 };
    cur.spent += price;
    cur.count += 1;
    map.set(key, cur);
  }
  for (const v of map.values()) v.spent = round2(Math.max(v.spent, 0));
  borrowNet = round2(borrowNet);
  if (borrowNet > 0) map.set(BORROW_CATEGORY, { spent: borrowNet, count: borrowCount });
  return map;
}

function totalOf(groups: Map<string, { spent: number; count: number }>): number {
  let t = 0;
  for (const g of groups.values()) t += g.spent;
  return round2(t);
}

export interface AnalyzeInput {
  expenses: Expense[];
  period: AnalysisPeriod;
  /** Explicit previous window for trend (e.g. the previous monthly cycle). */
  priorRange?: { start: Date; end: Date };
  planTotal?: number | null;
  /** Currency-aware money formatter for recommendation copy. */
  formatMoney: (value: number) => string;
}

export function analyzeSpending(input: AnalyzeInput): SpendingAnalysis {
  const { expenses, period, priorRange, planTotal = null, formatMoney } = input;
  const periodDays = periodLengthDays(period.start, period.end);

  const current = filterExpensesByDate(expenses, period.start, period.end);
  const prev = priorRange ?? priorPeriod(period);
  const prior = filterExpensesByDate(expenses, prev.start, prev.end);

  const currentGroups = buildGroups(current);
  const priorGroups = buildGroups(prior);

  const totalSpent = totalOf(currentGroups);
  const totalPriorSpent = totalOf(priorGroups);

  const orderedKeys = expenseCategories.map((c) => c.key);
  const known = new Set([...orderedKeys, BORROW_CATEGORY]);
  const extraKeys = [...currentGroups.keys()].filter((k) => !known.has(k));
  const allKeys = [...orderedKeys, BORROW_CATEGORY, ...Array.from(new Set(extraKeys))];

  const categories: CategoryAnalysis[] = [];
  for (const category of allKeys) {
    const g = currentGroups.get(category);
    const spent = g?.spent ?? 0;
    const count = g?.count ?? 0;
    const priorSpent = priorGroups.get(category)?.spent ?? 0;
    if (spent === 0 && count === 0 && priorSpent === 0) continue;

    const { deltaPct, trend } = trendFor(spent, priorSpent);
    categories.push({
      category,
      spent,
      share: totalSpent > 0 ? round2(spent / totalSpent) : 0,
      count,
      priorSpent,
      deltaPct,
      deltaAmount: round2(spent - priorSpent),
      trend,
      rank: 0,
      isBorrow: category === BORROW_CATEGORY,
    });
  }

  categories.sort((a, b) => b.spent - a.spent);
  categories.forEach((c, i) => {
    c.rank = i + 1;
  });

  const recommendations = buildRecommendations({
    categories,
    totalSpent,
    planTotal,
    formatMoney,
  });

  return {
    totalSpent,
    totalPriorSpent,
    planTotal,
    periodDays,
    categories,
    recommendations,
  };
}

const pct = (d: number | null) => (d === null ? '' : `${Math.round(d * 100)}%`);

function buildRecommendations(args: {
  categories: CategoryAnalysis[];
  totalSpent: number;
  planTotal: number | null;
  formatMoney: (value: number) => string;
}): Recommendation[] {
  const { categories, totalSpent, planTotal, formatMoney } = args;
  const fmt = formatMoney;
  const recs: Recommendation[] = [];

  // 1. Over / under the plan's total budget.
  if (planTotal !== null && totalSpent > planTotal) {
    const gap = round2(totalSpent - planTotal);
    const top = categories[0];
    const driver = top ? ` The biggest category was ${top.category} at ${fmt(top.spent)}.` : '';
    const totalStr = fmt(totalSpent);
    const gapStr = fmt(gap);
    const planStr = fmt(planTotal);
    recs.push({
      id: 'total-breach',
      category: null,
      type: 'total_breach',
      severity: 'high',
      amount: gap,
      message: `You spent ${totalStr}, which is ${gapStr} over this budget of ${planStr}.${driver}`,
    });
  } else if (planTotal !== null) {
    const left = round2(planTotal - totalSpent);
    const totalStr = fmt(totalSpent);
    const leftStr = fmt(left);
    recs.push({
      id: 'on-budget',
      category: null,
      type: 'on_budget',
      severity: 'low',
      amount: left,
      message: `You spent ${totalStr} this cycle — ${leftStr} under budget. Nice work.`,
    });
  }

  // 2. Biggest category (skip the Borrowed line — it isn't a spending choice).
  const top = categories.find((c) => !c.isBorrow && c.spent > 0);
  if (top) {
    const sharePct = Math.round(top.share * 100);
    const spentStr = fmt(top.spent);
    recs.push({
      id: `top-${top.category}`,
      category: top.category,
      type: 'top_spend',
      severity: 'medium',
      amount: top.spent,
      message: `${top.category} was your largest expense at ${spentStr} (${sharePct}% of spending). Trimming here has the biggest effect next cycle.`,
    });
  }

  // 3. Rising categories worth flagging.
  for (const c of categories) {
    if (c.isBorrow) continue;
    if (
      c.trend === 'up' &&
      c.deltaPct !== null &&
      c.deltaPct >= RISING_THRESHOLD &&
      c.share >= RISING_MIN_SHARE &&
      c.category !== top?.category
    ) {
      const spentStr = fmt(c.spent);
      recs.push({
        id: `rising-${c.category}`,
        category: c.category,
        type: 'rising',
        severity: 'medium',
        amount: c.spent,
        message: `${c.category} rose ${pct(c.deltaPct)} to ${spentStr} versus last cycle — worth keeping an eye on.`,
      });
    }
  }

  return recs;
}
