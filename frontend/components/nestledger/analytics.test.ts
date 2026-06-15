import {
  analyzeSpending,
  BORROW_CATEGORY,
  filterExpensesByDate,
  periodLengthDays,
  type AnalysisPeriod,
} from './analytics';
import type { Expense } from '../../lib/nestledger';

let seq = 0;
function expense(
  category: string,
  price: number,
  date: string,
  opts: { borrow?: boolean; used?: string; paid?: string | null } = {},
): Expense {
  seq += 1;
  return {
    id: `e${seq}`,
    added_by: 'u1',
    category,
    created_at: date,
    date,
    description: null,
    is_borrow: !!opts.borrow,
    paid_by: opts.paid ?? null,
    plan_id: 'p1',
    price,
    profile_id: 'prof1',
    used_by: opts.used ?? 'u1',
  };
}

const money = (n: number) => `$${n.toFixed(2)}`;

// A monthly cycle: May 10 → Jun 10, with the previous cycle Apr 10 → May 10.
const cycle: AnalysisPeriod = {
  start: new Date('2026-05-10T00:00:00Z'),
  end: new Date('2026-06-09T23:59:59Z'),
};
const priorRange = {
  start: new Date('2026-04-10T00:00:00Z'),
  end: new Date('2026-05-09T23:59:59Z'),
};

describe('period helpers', () => {
  it('counts inclusive days', () => {
    expect(periodLengthDays(new Date('2026-05-10'), new Date('2026-06-09'))).toBe(31);
    expect(periodLengthDays(new Date('2026-06-15'), new Date('2026-06-15'))).toBe(1);
  });

  it('filters expenses to the window inclusively', () => {
    const xs = [
      expense('Food & Dining', 10, '2026-05-09T12:00:00Z'),
      expense('Food & Dining', 10, '2026-05-20T12:00:00Z'),
      expense('Food & Dining', 10, '2026-06-20T12:00:00Z'),
    ];
    expect(filterExpensesByDate(xs, cycle.start, cycle.end)).toHaveLength(1);
  });
});

describe('borrow handling', () => {
  it('nets borrow minus repay into a single Borrowed category', () => {
    const r = analyzeSpending({
      expenses: [
        expense('Food & Dining', 300, '2026-05-15T10:00:00Z'),
        expense('Borrow', 100, '2026-05-16T10:00:00Z', { borrow: true }),
        expense('Repay', -40, '2026-05-20T10:00:00Z', { borrow: true }),
      ],
      period: cycle,
      priorRange,
      planTotal: 1000,
      formatMoney: money,
    });
    const borrowed = r.categories.find((c) => c.category === BORROW_CATEGORY);
    expect(borrowed?.spent).toBe(60); // 100 - 40 outstanding
    expect(r.categories.find((c) => c.category === 'Borrow')).toBeUndefined();
    expect(r.categories.find((c) => c.category === 'Repay')).toBeUndefined();
    expect(r.totalSpent).toBe(360); // 300 + 60
  });

  it('hides borrows that are fully repaid', () => {
    const r = analyzeSpending({
      expenses: [
        expense('Borrow', 100, '2026-05-16T10:00:00Z', { borrow: true }),
        expense('Repay', -100, '2026-05-20T10:00:00Z', { borrow: true }),
      ],
      period: cycle,
      priorRange,
      formatMoney: money,
    });
    expect(r.categories.find((c) => c.category === BORROW_CATEGORY)).toBeUndefined();
    expect(r.totalSpent).toBe(0);
  });

  it('never recommends trimming the Borrowed line as top spend', () => {
    const r = analyzeSpending({
      expenses: [
        expense('Food & Dining', 50, '2026-05-15T10:00:00Z'),
        expense('Borrow', 500, '2026-05-16T10:00:00Z', { borrow: true }),
      ],
      period: cycle,
      priorRange,
      formatMoney: money,
    });
    const top = r.recommendations.find((x) => x.type === 'top_spend');
    expect(top?.category).toBe('Food & Dining');
  });
});

describe('trend vs previous cycle', () => {
  it('marks a category with no prior spend as "new" instead of a huge %', () => {
    const r = analyzeSpending({
      expenses: [expense('Transport', 80, '2026-05-15T10:00:00Z')],
      period: cycle,
      priorRange,
      formatMoney: money,
    });
    const t = r.categories.find((c) => c.category === 'Transport')!;
    expect(t.trend).toBe('new');
    expect(t.deltaPct).toBeNull();
  });

  it('computes a real percentage and amount change when prior spend exists', () => {
    const r = analyzeSpending({
      expenses: [
        expense('Food & Dining', 520, '2026-05-15T10:00:00Z'),
        expense('Food & Dining', 400, '2026-04-15T10:00:00Z'),
      ],
      period: cycle,
      priorRange,
      planTotal: 1000,
      formatMoney: money,
    });
    const f = r.categories.find((c) => c.category === 'Food & Dining')!;
    expect(f.trend).toBe('up');
    expect(f.deltaAmount).toBe(120);
    expect(Math.round((f.deltaPct ?? 0) * 100)).toBe(30); // 120/400
  });
});

describe('budget recommendations', () => {
  it('flags going over the plan total', () => {
    const r = analyzeSpending({
      expenses: [expense('Food & Dining', 800, '2026-05-15T10:00:00Z')],
      period: cycle,
      priorRange,
      planTotal: 700,
      formatMoney: money,
    });
    const breach = r.recommendations.find((x) => x.type === 'total_breach');
    expect(breach?.amount).toBe(100);
  });

  it('reports being under budget', () => {
    const r = analyzeSpending({
      expenses: [expense('Food & Dining', 300, '2026-05-15T10:00:00Z')],
      period: cycle,
      priorRange,
      planTotal: 700,
      formatMoney: money,
    });
    const ob = r.recommendations.find((x) => x.type === 'on_budget');
    expect(ob?.amount).toBe(400);
  });

  it('handles an empty cycle without throwing', () => {
    const r = analyzeSpending({ expenses: [], period: cycle, priorRange, formatMoney: money });
    expect(r.totalSpent).toBe(0);
    expect(r.categories).toHaveLength(0);
    expect(r.recommendations).toHaveLength(0);
  });
});
