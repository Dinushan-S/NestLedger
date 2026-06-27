/**
 * Data-integrity tests for derived-ledger math.
 *
 * These guard the money calculations users can't forgive getting wrong:
 *   - borrow / repay netting in budget stats
 *   - per-member borrowed / repaid / contributed / owes balances
 *   - bill-tracker paid vs. pending (the bill→expense linkage surface)
 *   - savings deposits / withdrawals / balance (the savings→expense surface)
 *   - cycle-window and plan-scoping filters
 *   - decimal-amount precision (currency is summed as raw numbers)
 *
 * Functions under test are pure, so we feed fixtures dated relative to "now"
 * to stay deterministic regardless of when the suite runs.
 */
import {
  buildCurrentMonthStatsMap,
  buildCurrentMonthBillStatsMap,
  buildCurrentMonthSavingsStatsMap,
  buildCurrentPlanMonthStats,
  type MemberSummary,
} from './selectors';
import type {
  BudgetPlan,
  ExpenseWithItems,
  BillPayment,
  BillTrackerMeta,
  RecurringBill,
  SavingsEntry,
  SavingsTrackerMeta,
} from '@/lib/nestledger';

// ---- date helpers (deterministic relative to run time) --------------------
const now = new Date();
const iso = (d: Date) => d.toISOString();
const todayIso = iso(now);
// 1st of last calendar month → getCycleStart anchors to day 1 → cycle = 1st of this month.
const planStartIso = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1));
// A date in the previous cycle (15th of last month) — should be excluded from this cycle.
const lastMonthIso = iso(new Date(now.getFullYear(), now.getMonth() - 1, 15));
const thisMonth = now.getMonth() + 1;
const thisYear = now.getFullYear();

// ---- fixture factories (cast to keep fixtures minimal) --------------------
let seq = 0;
const expense = (o: Partial<ExpenseWithItems>): ExpenseWithItems =>
  ({
    added_by: 'u1',
    category: 'General',
    created_at: todayIso,
    date: todayIso,
    description: null,
    id: `e${seq++}`,
    is_borrow: false,
    paid_by: null,
    plan_id: 'plan1',
    price: 0,
    profile_id: 'p1',
    used_by: null,
    items: [],
    ...o,
  }) as ExpenseWithItems;

const plan = (o: Partial<BudgetPlan> = {}): BudgetPlan =>
  ({
    created_at: planStartIso,
    created_by: 'u1',
    end_date: todayIso,
    id: 'plan1',
    name: 'Household',
    profile_id: 'p1',
    start_date: planStartIso,
    total_amount: 1000,
    ...o,
  }) as BudgetPlan;

const member = (id: string): MemberSummary => ({
  avatar: '🙂',
  email: `${id}@example.com`,
  name: id,
});

const billPayment = (o: Partial<BillPayment>): BillPayment =>
  ({
    id: `bp${seq++}`,
    profile_id: 'p1',
    tracker_id: 't1',
    bill_id: 'b1',
    plan_id: null,
    amount: 0,
    units: null,
    name: null,
    status: 'paid',
    date: todayIso,
    month: thisMonth,
    year: thisYear,
    added_by: 'u1',
    created_at: todayIso,
    ...o,
  }) as BillPayment;

const recurringBill = (o: Partial<RecurringBill>): RecurringBill =>
  ({
    id: `b${seq++}`,
    profile_id: 'p1',
    tracker_id: 't1',
    name: 'Bill',
    category: 'Utilities',
    default_amount: 0,
    default_units: null,
    due_day: 1,
    notify_days_before: 1,
    is_recurring: true,
    is_active: true,
    created_by: 'u1',
    created_at: todayIso,
    ...o,
  }) as RecurringBill;

const billTracker = (id = 't1'): BillTrackerMeta =>
  ({ id, profile_id: 'p1', name: 'Bills', created_by: 'u1', created_at: todayIso }) as BillTrackerMeta;

const savingsEntry = (o: Partial<SavingsEntry>): SavingsEntry =>
  ({
    id: `s${seq++}`,
    profile_id: 'p1',
    tracker_id: 'st1',
    amount: 0,
    note: null,
    name: null,
    linked_plan_id: null,
    date: todayIso,
    added_by: 'u1',
    created_at: todayIso,
    ...o,
  }) as SavingsEntry;

const savingsTracker = (id = 'st1'): SavingsTrackerMeta =>
  ({ id, profile_id: 'p1', name: 'Savings', created_by: 'u1', created_at: todayIso }) as SavingsTrackerMeta;

// ===========================================================================
describe('buildCurrentMonthStatsMap — budget spent/remaining', () => {
  it('sums a plain family expense and leaves the rest as remaining', () => {
    const stats = buildCurrentMonthStatsMap([plan({ total_amount: 1000 })], [expense({ price: 200 })]);
    expect(stats.plan1.spent).toBe(200);
    expect(stats.plan1.allocated).toBe(1000);
    expect(stats.plan1.remaining).toBe(800);
  });

  it('nets borrow against repay (borrow +100, repay -40 → spent 60)', () => {
    const stats = buildCurrentMonthStatsMap(
      [plan({ total_amount: 1000 })],
      [
        expense({ is_borrow: true, price: 100 }),
        expense({ is_borrow: true, price: -40 }),
      ],
    );
    expect(stats.plan1.spent).toBe(60);
    expect(stats.plan1.remaining).toBe(940);
  });

  it('adds member contributions to both spend and allocation', () => {
    const stats = buildCurrentMonthStatsMap(
      [plan({ total_amount: 1000 })],
      [expense({ paid_by: 'u2', price: 50 })],
    );
    expect(stats.plan1.spent).toBe(50);
    expect(stats.plan1.allocated).toBe(1050); // total + contributions
    expect(stats.plan1.remaining).toBe(1000);
  });

  it('excludes expenses outside the current cycle and from other plans', () => {
    const stats = buildCurrentMonthStatsMap(
      [plan({ id: 'plan1', total_amount: 1000 })],
      [
        expense({ price: 100 }), // in cycle, this plan
        expense({ price: 999, date: lastMonthIso }), // previous cycle → excluded
        expense({ price: 999, plan_id: 'other' }), // other plan → excluded
      ],
    );
    expect(stats.plan1.spent).toBe(100);
  });

  it('floors remaining at 0 when overspent (never shows negative budget)', () => {
    const stats = buildCurrentMonthStatsMap([plan({ total_amount: 100 })], [expense({ price: 250 })]);
    expect(stats.plan1.spent).toBe(250);
    expect(stats.plan1.remaining).toBe(0);
  });

  it('keeps decimal amounts correct to cent precision', () => {
    const stats = buildCurrentMonthStatsMap(
      [plan({ total_amount: 100 })],
      [expense({ price: 10.1 }), expense({ price: 20.2 }), expense({ price: 5.05 })],
    );
    expect(stats.plan1.spent).toBeCloseTo(35.35, 2);
    expect(stats.plan1.remaining).toBeCloseTo(64.65, 2);
  });
});

describe('buildCurrentPlanMonthStats — per-member balances & owes', () => {
  const memberMap = new Map<string, MemberSummary>([
    ['u2', member('u2')],
    ['u3', member('u3')],
  ]);

  it('returns a zeroed summary when no plan is selected', () => {
    const summary = buildCurrentPlanMonthStats([], memberMap, null);
    expect(summary.totalSpent).toBe(0);
    expect(summary.memberBalances).toEqual({});
  });

  it('tracks borrowed, repaid, contributed and computes owes', () => {
    const summary = buildCurrentPlanMonthStats(
      [
        expense({ used_by: 'u2', is_borrow: true, price: 100 }), // u2 borrows 100
        expense({ used_by: 'u2', is_borrow: true, price: -30 }), // u2 repays 30
        expense({ paid_by: 'u2', price: 20 }), // u2 contributes 20
      ],
      memberMap,
      plan(),
    );
    const u2 = summary.memberBalances.u2;
    expect(u2.borrowed).toBe(100);
    expect(u2.repaid).toBe(30);
    expect(u2.contributed).toBe(20);
    // owes = borrowed - repaid - contributed = 100 - 30 - 20 = 50
    expect(u2.owes).toBe(50);
  });

  it('floors owes at 0 when repayments + contributions exceed borrowing', () => {
    const summary = buildCurrentPlanMonthStats(
      [
        expense({ used_by: 'u3', is_borrow: true, price: 40 }),
        expense({ used_by: 'u3', is_borrow: true, price: -50 }),
      ],
      memberMap,
      plan(),
    );
    expect(summary.memberBalances.u3.owes).toBe(0);
  });

  it('computes totalSpent as spent + contributions + borrowed - repaid', () => {
    const summary = buildCurrentPlanMonthStats(
      [
        expense({ price: 100 }), // family spend
        expense({ paid_by: 'u2', price: 50 }), // contribution
        expense({ used_by: 'u2', is_borrow: true, price: 60 }), // borrow
        expense({ used_by: 'u2', is_borrow: true, price: -10 }), // repay
      ],
      memberMap,
      plan(),
    );
    // 100 + 50 + 60 - 10 = 200
    expect(summary.totalSpent).toBe(200);
  });
});

describe('buildCurrentMonthBillStatsMap — bill paid vs pending', () => {
  it('separates a paid bill from pending bills and sums correctly', () => {
    const stats = buildCurrentMonthBillStatsMap(
      [billPayment({ bill_id: 'b1', amount: 120, status: 'paid' })],
      [billTracker('t1')],
      [
        recurringBill({ id: 'b1', default_amount: 120 }), // paid this month
        recurringBill({ id: 'b2', default_amount: 80 }), // still pending
      ],
    );
    expect(stats.t1.paid).toBe(120);
    expect(stats.t1.paidCount).toBe(1);
    expect(stats.t1.pending).toBe(80);
    expect(stats.t1.pendingCount).toBe(1);
    expect(stats.t1.totalCount).toBe(2);
  });

  it('ignores payments from other months (bill stays pending)', () => {
    const stats = buildCurrentMonthBillStatsMap(
      [billPayment({ bill_id: 'b1', amount: 120, status: 'paid', month: thisMonth === 1 ? 12 : thisMonth - 1 })],
      [billTracker('t1')],
      [recurringBill({ id: 'b1', default_amount: 120 })],
    );
    expect(stats.t1.paid).toBe(0);
    expect(stats.t1.paidCount).toBe(0);
    expect(stats.t1.pending).toBe(120);
    expect(stats.t1.pendingCount).toBe(1);
  });
});

describe('buildCurrentMonthSavingsStatsMap — deposits/withdrawals/balance', () => {
  it('computes month deposits/withdrawals/net while balance spans all entries', () => {
    const stats = buildCurrentMonthSavingsStatsMap(
      [
        savingsEntry({ amount: 500, date: lastMonthIso }), // older deposit → balance only
        savingsEntry({ amount: 200, date: todayIso }), // this month deposit
        savingsEntry({ amount: -80, date: todayIso }), // this month withdrawal (→ linked expense)
      ],
      [savingsTracker('st1')],
    );
    expect(stats.st1.balance).toBe(620); // 500 + 200 - 80, all-time
    expect(stats.st1.deposits).toBe(200); // this month only
    expect(stats.st1.withdrawals).toBe(80); // abs, this month only
    expect(stats.st1.net).toBe(120); // 200 - 80
  });
});
