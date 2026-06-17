import {
  ExpenseWithItems,
  BillPayment,
  BillTrackerMeta,
  BudgetPlan,
  Member,
  RecurringBill,
  SavingsEntry,
  SavingsTrackerMeta,
  ShoppingItem,
} from '@/lib/nestledger';
import { expenseFilters, getCycleStart, startOfMonth, startOfToday, startOfWeek } from '@/constants/nestledger';

type ExpenseWindow = (typeof expenseFilters)[number];

export type MemberSummary = {
  avatar: string;
  email: string;
  name: string;
};

export type BudgetMonthStats = {
  allocated: number;
  remaining: number;
  spent: number;
};

export type BillMonthStats = {
  paid: number;
  paidCount: number;
  pending: number;
  pendingCount: number;
  totalCount: number;
};

export type SavingsMonthStats = {
  balance: number;
  deposits: number;
  net: number;
  withdrawals: number;
};

export type PlanMemberBalance = MemberSummary & {
  borrowed: number;
  contributed: number;
  owes: number;
  repaid: number;
};

export type PlanMonthSummary = {
  allocated: number;
  borrowed: number;
  contributions: number;
  memberBalances: Record<string, PlanMemberBalance>;
  remaining: number;
  repaid: number;
  spent: number;
  totalSpent: number;
};

const defaultPlanMonthSummary: PlanMonthSummary = {
  allocated: 0,
  borrowed: 0,
  contributions: 0,
  memberBalances: {},
  remaining: 0,
  repaid: 0,
  spent: 0,
  totalSpent: 0,
};

export function buildAvailableViewYears(
  profileExpenses: ExpenseWithItems[],
  selectedPlan: BudgetPlan | null,
) {
  if (!selectedPlan) {
    return [new Date().getFullYear()];
  }

  const years = new Set<number>();
  years.add(new Date(selectedPlan.start_date).getFullYear());
  years.add(new Date().getFullYear());

  if (selectedPlan.end_date) {
    years.add(new Date(selectedPlan.end_date).getFullYear());
  }

  profileExpenses
    .filter((expense) => expense.plan_id === selectedPlan.id)
    .forEach((expense) => years.add(new Date(expense.date).getFullYear()));

  return [...years].sort();
}

export function buildAvailableViewMonths(
  activeViewYear: number,
  profileExpenses: ExpenseWithItems[],
  selectedPlan: BudgetPlan | null,
) {
  if (!selectedPlan) {
    return [];
  }

  const months = new Set<number>();
  profileExpenses
    .filter((expense) => expense.plan_id === selectedPlan.id)
    .forEach((expense) => {
      const date = new Date(expense.date);
      if (date.getFullYear() === activeViewYear) {
        months.add(date.getMonth() + 1);
      }
    });

  const now = new Date();
  if (activeViewYear === new Date(selectedPlan.start_date).getFullYear()) {
    months.add(new Date(selectedPlan.start_date).getMonth() + 1);
  }
  if (activeViewYear === now.getFullYear()) {
    months.add(now.getMonth() + 1);
  }

  return [...months].sort();
}

export function filterMonthExpenses({
  activeViewMonth,
  activeViewYear,
  profileExpenses,
  selectedPlan,
}: {
  activeViewMonth: number | 'current';
  activeViewYear: number;
  profileExpenses: ExpenseWithItems[];
  selectedPlan: BudgetPlan | null;
}) {
  if (!selectedPlan || activeViewMonth === 'current') {
    return null;
  }

  return profileExpenses.filter((expense) => {
    if (expense.plan_id !== selectedPlan.id) {
      return false;
    }

    const date = new Date(expense.date);
    return date.getFullYear() === activeViewYear && date.getMonth() + 1 === activeViewMonth;
  });
}

export function buildMemberMap(members: Member[]) {
  return new Map<string, MemberSummary>(
    members.map((member) => [
      member.user_id,
      {
        avatar: member.user_profile?.avatar_emoji ?? '🏡',
        email: member.user_profile?.email ?? '',
        name: member.user_profile?.name ?? 'Member',
      },
    ]),
  );
}

export function buildCurrentPlanExpenses(
  plans: BudgetPlan[],
  profileExpenses: ExpenseWithItems[],
) {
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));

  return profileExpenses.filter((expense) => {
    const plan = plansById.get(expense.plan_id);
    if (!plan || expense.is_borrow) {
      return true;
    }

    return new Date(expense.date) >= new Date(plan.start_date);
  });
}

export function buildPersonalContributions(
  currentPlanExpenses: ExpenseWithItems[],
  memberMap: Map<string, MemberSummary>,
) {
  const contributions: Record<string, { member: MemberSummary; total: number }> = {};

  currentPlanExpenses.forEach((expense) => {
    if (!expense.paid_by || expense.is_borrow) {
      return;
    }

    const member = memberMap.get(expense.paid_by);
    if (!member) {
      return;
    }

    if (!contributions[expense.paid_by]) {
      contributions[expense.paid_by] = { member, total: 0 };
    }

    contributions[expense.paid_by].total += Number(expense.price ?? 0);
  });

  return contributions;
}

export function buildCurrentMonthStatsMap(
  plans: BudgetPlan[],
  profileExpenses: ExpenseWithItems[],
) {
  const map: Record<string, BudgetMonthStats> = {};

  plans.forEach((plan) => {
    const cycleStart = getCycleStart(plan.start_date);
    const monthExpenses = profileExpenses.filter(
      (expense) => new Date(expense.date) >= cycleStart && expense.plan_id === plan.id,
    );
    const family = monthExpenses
      .filter((expense) => !expense.paid_by && !expense.is_borrow)
      .reduce((sum, expense) => sum + Number(expense.price ?? 0), 0);
    const contributions = monthExpenses
      .filter((expense) => expense.paid_by && !expense.is_borrow)
      .reduce((sum, expense) => sum + Number(expense.price ?? 0), 0);
    const borrowed = monthExpenses
      .filter((expense) => expense.is_borrow && expense.price > 0)
      .reduce((sum, expense) => sum + Number(expense.price ?? 0), 0);
    const repaid = monthExpenses
      .filter((expense) => expense.is_borrow && expense.price < 0)
      .reduce((sum, expense) => sum + Math.abs(Number(expense.price ?? 0)), 0);
    const spent = family + contributions + borrowed - repaid;
    const allocated = plan.total_amount + contributions;

    map[plan.id] = {
      allocated,
      remaining: Math.max(allocated - spent, 0),
      spent,
    };
  });

  return map;
}

export function buildCurrentMonthBillStatsMap(
  billPayments: BillPayment[],
  billTrackers: BillTrackerMeta[],
  recurringBills: RecurringBill[],
) {
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const map: Record<string, BillMonthStats> = {};

  billTrackers.forEach((tracker) => {
    const trackerBills = recurringBills.filter((bill) => bill.tracker_id === tracker.id);
    const trackerPayments = billPayments.filter((payment) => payment.tracker_id === tracker.id);
    const paidBills = new Set(
      trackerPayments
        .filter(
          (payment) =>
            payment.status === 'paid' &&
            payment.month === thisMonth &&
            payment.year === thisYear,
        )
        .map((payment) => payment.bill_id),
    );
    const paid = trackerPayments
      .filter(
        (payment) =>
          payment.status === 'paid' &&
          payment.month === thisMonth &&
          payment.year === thisYear,
      )
      .reduce((sum, payment) => sum + payment.amount, 0);
    const pendingBills = trackerBills.filter((bill) => !paidBills.has(bill.id));
    const pending = pendingBills.reduce((sum, bill) => sum + bill.default_amount, 0);

    map[tracker.id] = {
      paid,
      paidCount: paidBills.size,
      pending,
      pendingCount: pendingBills.length,
      totalCount: trackerBills.length,
    };
  });

  return map;
}

export function buildCurrentMonthSavingsStatsMap(
  savings: SavingsEntry[],
  savingsTrackers: SavingsTrackerMeta[],
) {
  const monthStart = startOfMonth();
  const map: Record<string, SavingsMonthStats> = {};

  savingsTrackers.forEach((tracker) => {
    const entries = savings.filter((entry) => entry.tracker_id === tracker.id);
    const balance = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const monthEntries = entries.filter((entry) => new Date(entry.date) >= monthStart);
    const deposits = monthEntries
      .filter((entry) => entry.amount > 0)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const withdrawals = monthEntries
      .filter((entry) => entry.amount < 0)
      .reduce((sum, entry) => sum + Math.abs(entry.amount), 0);

    map[tracker.id] = {
      balance,
      deposits,
      net: deposits - withdrawals,
      withdrawals,
    };
  });

  return map;
}

export function filterShoppingItems(
  shoppingFilter: 'All' | 'Bought' | 'Pending',
  shoppingItems: ShoppingItem[],
) {
  if (shoppingFilter === 'Pending') {
    return shoppingItems.filter((item) => !item.is_bought);
  }
  if (shoppingFilter === 'Bought') {
    return shoppingItems.filter((item) => item.is_bought);
  }

  return shoppingItems;
}

export function buildCurrentPlanMonthStats(
  currentPlanExpenses: ExpenseWithItems[],
  memberMap: Map<string, MemberSummary>,
  selectedPlan: BudgetPlan | null,
) {
  if (!selectedPlan) {
    return defaultPlanMonthSummary;
  }

  const cycleStart = getCycleStart(selectedPlan.start_date);
  const planExpenses = currentPlanExpenses.filter((expense) => expense.plan_id === selectedPlan.id);
  const monthNonBorrow = planExpenses.filter(
    (expense) => !expense.is_borrow && new Date(expense.date) >= cycleStart,
  );
  const spent = monthNonBorrow
    .filter((expense) => !expense.paid_by)
    .reduce((sum, expense) => sum + Number(expense.price ?? 0), 0);
  const contributions = monthNonBorrow
    .filter((expense) => expense.paid_by)
    .reduce((sum, expense) => sum + Number(expense.price ?? 0), 0);
  const borrowed = planExpenses
    .filter(
      (expense) =>
        expense.is_borrow && expense.price > 0 && new Date(expense.date) >= cycleStart,
    )
    .reduce((sum, expense) => sum + Number(expense.price ?? 0), 0);
  const repaid = planExpenses
    .filter(
      (expense) =>
        expense.is_borrow && expense.price < 0 && new Date(expense.date) >= cycleStart,
    )
    .reduce((sum, expense) => sum + Math.abs(Number(expense.price ?? 0)), 0);
  const totalSpent = spent + contributions + borrowed - repaid;
  const allocated = selectedPlan.total_amount + contributions;
  const memberBalances: Record<string, PlanMemberBalance> = {};

  planExpenses
    .filter((expense) => new Date(expense.date) >= cycleStart)
    .forEach((expense) => {
      if (!expense.is_borrow) {
        return;
      }

      const userId = expense.used_by ?? expense.added_by;
      const member = memberMap.get(userId);
      if (!member) {
        return;
      }

      if (!memberBalances[userId]) {
        memberBalances[userId] = { ...member, borrowed: 0, contributed: 0, owes: 0, repaid: 0 };
      }

      if (expense.price > 0) {
        memberBalances[userId].borrowed += expense.price;
      } else {
        memberBalances[userId].repaid += Math.abs(expense.price);
      }
    });

  monthNonBorrow
    .filter((expense) => expense.paid_by)
    .forEach((expense) => {
      const member = memberMap.get(expense.paid_by!);
      if (!member) {
        return;
      }
      if (!memberBalances[expense.paid_by!]) {
        memberBalances[expense.paid_by!] = {
          ...member,
          borrowed: 0,
          contributed: 0,
          owes: 0,
          repaid: 0,
        };
      }

      memberBalances[expense.paid_by!].contributed += Number(expense.price ?? 0);
    });

  Object.values(memberBalances).forEach((balance) => {
    balance.owes = Math.max(balance.borrowed - balance.repaid - balance.contributed, 0);
  });

  return {
    allocated,
    borrowed,
    contributions,
    memberBalances,
    remaining: Math.max(allocated - totalSpent, 0),
    repaid,
    spent,
    totalSpent,
  };
}

export function filterExpensesForView({
  expenseCategoryFilter,
  expenseView,
  profileExpenses,
  selectedPlan,
}: {
  expenseCategoryFilter: string;
  expenseView: ExpenseWindow;
  profileExpenses: ExpenseWithItems[];
  selectedPlan: BudgetPlan | null;
}) {
  if (!selectedPlan) {
    return [];
  }

  const planStartDate = new Date(selectedPlan.start_date);
  const base = profileExpenses.filter(
    (expense) =>
      expense.plan_id === selectedPlan.id &&
      !expense.is_borrow &&
      new Date(expense.date) >= planStartDate,
  );
  const today = startOfToday();
  const weekStart = startOfWeek();
  const cycleStart = getCycleStart(selectedPlan.start_date);

  return base.filter((expense) => {
    const expenseDate = new Date(expense.date);
    const matchesWindow =
      expenseView === 'Day'
        ? expenseDate >= today
        : expenseView === 'Week'
          ? expenseDate >= weekStart
          : expenseDate >= cycleStart;
    const matchesCategory =
      expenseCategoryFilter === 'All' || expense.category === expenseCategoryFilter;

    return matchesWindow && matchesCategory;
  });
}
