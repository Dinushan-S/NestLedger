import { Dispatch, SetStateAction, useCallback, useRef, useState } from 'react';
import { extractError } from '../nestledger.constants';
import { getCached } from '@/lib/offline';

import {
  BillPayment,
  BillTrackerMeta,
  BudgetPlan,
  ExpenseWithItems,
  Member,
  ExpenseShortcut,
  RecurringBill,
  SavingsEntry,
  SavingsTrackerMeta,
  ShoppingItem,
  billApi,
  budgetApi,
  expenseApi,
  notificationApi,
  profileApi,
  expenseShortcutApi,
  savingsApi,
  shoppingApi,
  type AppNotification,
} from '@/lib/nestledger';

type UseProfileDataControllerOptions = {
  onError: (message: string | null) => void;
  selectedPlanId: string | null;
  sessionUserId: string | undefined;
  setBillPayments: Dispatch<SetStateAction<BillPayment[]>>;
  setBillTrackers: Dispatch<SetStateAction<BillTrackerMeta[]>>;
  setMembers: Dispatch<SetStateAction<Member[]>>;
  setNotifications: Dispatch<SetStateAction<AppNotification[]>>;
  setPlans: Dispatch<SetStateAction<BudgetPlan[]>>;
  setProfileExpenses: Dispatch<SetStateAction<ExpenseWithItems[]>>;
  setExpenseShortcuts: Dispatch<SetStateAction<ExpenseShortcut[]>>;
  setRecurringBills: Dispatch<SetStateAction<RecurringBill[]>>;
  setSavings: Dispatch<SetStateAction<SavingsEntry[]>>;
  setSavingsTrackers: Dispatch<SetStateAction<SavingsTrackerMeta[]>>;
  setSelectedPlanId: Dispatch<SetStateAction<string | null>>;
  setShoppingItems: Dispatch<SetStateAction<ShoppingItem[]>>;
};

export function useProfileDataController({
  onError,
  selectedPlanId,
  sessionUserId,
  setBillPayments,
  setBillTrackers,
  setMembers,
  setNotifications,
  setPlans,
  setProfileExpenses,
  setExpenseShortcuts,
  setRecurringBills,
  setSavings,
  setSavingsTrackers,
  setSelectedPlanId,
  setShoppingItems,
}: UseProfileDataControllerOptions) {
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const [widgetDataReadyProfileId, setWidgetDataReadyProfileId] = useState<string | null>(null);
  const lastRefreshRef = useRef(0);
  const lastProfileIdRef = useRef<string | null>(null);
  const latestRequest = useRef(0);

  // Latest prop values, readable from a callback that must never change identity.
  // These are only ever read while a refresh is in flight, so a ref gives the
  // same result as a dependency without recreating the callback. That matters:
  // useRealtimeChannel depends on refreshProfileData, so recreating it tears down
  // and re-registers all ten realtime subscriptions. Selecting a different budget
  // plan used to do exactly that.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const selectedPlanIdRef = useRef(selectedPlanId);
  selectedPlanIdRef.current = selectedPlanId;
  const sessionUserIdRef = useRef(sessionUserId);
  sessionUserIdRef.current = sessionUserId;

  const refreshProfileData = useCallback(
    async (profileId: string, force?: boolean) => {
      const userId = sessionUserIdRef.current;
      if (!userId) {
        return;
      }

      const now = Date.now();
      if (!force && lastProfileIdRef.current === profileId && now - lastRefreshRef.current < 1000) {
        return;
      }
      const firstRefreshForProfile = lastProfileIdRef.current !== profileId;
      if (firstRefreshForProfile) {
        setWidgetDataReadyProfileId(null);
        setMembers([]);
        setPlans([]);
        setProfileExpenses([]);
        setShoppingItems([]);
        setNotifications([]);
        setBillTrackers([]);
        setSavingsTrackers([]);
        setRecurringBills([]);
        setBillPayments([]);
        setSavings([]);
        setExpenseShortcuts([]);
        setSelectedPlanId(null);
        seenNotificationIds.current.clear();
      }
      lastProfileIdRef.current = profileId;
      lastRefreshRef.current = now;
      const request = ++latestRequest.current;

      try {
        // Restore-from-cache only seeds the first load of a profile; re-seeding on
        // later refreshes would flash stale snapshots over fresher local state.
        if (firstRefreshForProfile) {
          const restore = async <T,>(name: string, setter: Dispatch<SetStateAction<T>>, fallback: NoInfer<T>) => {
            const value = await getCached<T>(name);
            if (sessionUserIdRef.current === userId && request === latestRequest.current) setter(value ?? fallback);
          };
          await Promise.all([
            restore(`members:${profileId}`, setMembers, []),
            restore(`plans:${profileId}`, setPlans, []),
            restore(`expenses:${profileId}`, setProfileExpenses, []),
            restore(`shopping:${profileId}`, setShoppingItems, []),
            restore(`notifications:${profileId}:${userId}`, setNotifications, []),
            restore(`bill-trackers:${profileId}`, setBillTrackers, []),
            restore(`savings-trackers:${profileId}`, setSavingsTrackers, []),
            restore(`bills:${profileId}`, setRecurringBills, []),
            restore(`payments:${profileId}`, setBillPayments, []),
            restore(`savings:${profileId}`, setSavings, []),
            restore(`shortcuts:${profileId}`, setExpenseShortcuts, []),
          ]);
          if (sessionUserIdRef.current !== userId || request !== latestRequest.current) return;
        }
        const [
          nextMembers,
          nextPlans,
          nextExpenses,
          nextShopping,
          nextNotifications,
          nextBillTrackers,
          nextSavingsTrackers,
          nextBills,
          nextPayments,
          nextSavings,
        ] = await Promise.allSettled([
          profileApi.fetchMembers(profileId),
          budgetApi.fetchPlans(profileId),
          expenseApi.fetchProfileExpenses(profileId),
          shoppingApi.fetchItems(profileId),
          notificationApi.fetchForUser(profileId, userId),
          billApi.fetchTrackers(profileId),
          savingsApi.fetchTrackers(profileId),
          billApi.fetchRecurringBills(profileId),
          billApi.fetchPayments(profileId),
          savingsApi.fetchSavings(profileId),
        ]);

        // Drop the response if the user changed identity or a newer refresh won.
        if (sessionUserIdRef.current !== userId || request !== latestRequest.current) return;

        if (nextMembers.status === 'fulfilled') setMembers(nextMembers.value);
        if (nextPlans.status === 'fulfilled') setPlans(nextPlans.value);
        if (nextExpenses.status === 'fulfilled') setProfileExpenses(nextExpenses.value);
        if (nextShopping.status === 'fulfilled') setShoppingItems(nextShopping.value);
        if (nextNotifications.status === 'fulfilled') {
          setNotifications(nextNotifications.value);
          nextNotifications.value.forEach((item) => seenNotificationIds.current.add(item.id));
        }
        if (nextBillTrackers.status === 'fulfilled') setBillTrackers(nextBillTrackers.value);
        if (nextSavingsTrackers.status === 'fulfilled') setSavingsTrackers(nextSavingsTrackers.value);
        if (nextBills.status === 'fulfilled') setRecurringBills(nextBills.value);
        if (nextPayments.status === 'fulfilled') setBillPayments(nextPayments.value);
        if (nextSavings.status === 'fulfilled') setSavings(nextSavings.value);
        const activePlanId = selectedPlanIdRef.current;
        if (nextPlans.status === 'fulfilled' && activePlanId && !nextPlans.value.some((plan) => plan.id === activePlanId)) {
          setSelectedPlanId(null);
        }
        const results = [nextMembers, nextPlans, nextExpenses, nextShopping, nextNotifications,
          nextBillTrackers, nextSavingsTrackers, nextBills, nextPayments, nextSavings];
        const names = ['Members', 'Budgets', 'Expenses', 'Shopping', 'Notifications',
          'Bill trackers', 'Savings trackers', 'Bills', 'Payments', 'Savings'];
        const errors = results.flatMap((result, index) => result.status === 'rejected'
          ? [`${names[index]}: ${extractError(result.reason)}`] : []);
        onErrorRef.current(errors.length ? errors.join('\n') : null);
        try {
          const nextExpenseShortcuts = await expenseShortcutApi.fetch(profileId);
          if (sessionUserIdRef.current === userId && request === latestRequest.current) {
            setExpenseShortcuts(nextExpenseShortcuts);
            if (nextPlans.status === 'fulfilled') setWidgetDataReadyProfileId(profileId);
          }
        } catch (error) {
          if (sessionUserIdRef.current !== userId || request !== latestRequest.current) return;
          setExpenseShortcuts([]);
          if ((error as { code?: string }).code !== 'PGRST205') {
            errors.push(`Expense shortcuts: ${extractError(error)}`);
            onErrorRef.current(errors.join('\n'));
          }
        }
      } catch (error) {
        if (sessionUserIdRef.current !== userId || request !== latestRequest.current) return;
        const message = error instanceof Error ? error.message : 'Something went wrong.';
        onErrorRef.current(message);
      }
    },
    // Intentionally empty. Every prop this reads goes through a ref above, and
    // state setters are referentially stable for the component's lifetime, so
    // nothing here should ever change the callback's identity. The flat
    // signature matters for the same reason: a bag object would be a fresh
    // literal each render and defeat this entirely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return {
    refreshProfileData,
    seenNotificationIds,
    widgetDataReadyProfileId,
  };
}
