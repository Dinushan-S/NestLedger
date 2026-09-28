import { Dispatch, SetStateAction, useCallback, useRef } from 'react';

import {
  BillPayment,
  BillTrackerMeta,
  BudgetPlan,
  ExpenseWithItems,
  Member,
  RecurringBill,
  SavingsEntry,
  SavingsTrackerMeta,
  ShoppingItem,
  billApi,
  budgetApi,
  expenseApi,
  notificationApi,
  profileApi,
  savingsApi,
  shoppingApi,
  type AppNotification,
} from '@/lib/nestledger';

type UseProfileDataControllerOptions = {
  onError: (message: string) => void;
  selectedPlanId: string | null;
  sessionUserId: string | undefined;
  setBillPayments: Dispatch<SetStateAction<BillPayment[]>>;
  setBillTrackers: Dispatch<SetStateAction<BillTrackerMeta[]>>;
  setMembers: Dispatch<SetStateAction<Member[]>>;
  setNotifications: Dispatch<SetStateAction<AppNotification[]>>;
  setPlans: Dispatch<SetStateAction<BudgetPlan[]>>;
  setProfileExpenses: Dispatch<SetStateAction<ExpenseWithItems[]>>;
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
  setRecurringBills,
  setSavings,
  setSavingsTrackers,
  setSelectedPlanId,
  setShoppingItems,
}: UseProfileDataControllerOptions) {
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const lastRefreshRef = useRef(0);
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
      if (!force && now - lastRefreshRef.current < 1000) {
        return;
      }
      lastRefreshRef.current = now;
      const request = ++latestRequest.current;

      try {
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
        ] = await Promise.all([
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

        setMembers(nextMembers);
        setPlans(nextPlans);
        setProfileExpenses(nextExpenses);
        setShoppingItems(nextShopping);
        setNotifications(nextNotifications);
        setBillTrackers(nextBillTrackers);
        setSavingsTrackers(nextSavingsTrackers);
        setRecurringBills(nextBills);
        setBillPayments(nextPayments);
        setSavings(nextSavings);
        nextNotifications.forEach((item) => seenNotificationIds.current.add(item.id));

        const activePlanId = selectedPlanIdRef.current;
        if (activePlanId && !nextPlans.some((plan) => plan.id === activePlanId)) {
          setSelectedPlanId(null);
        }
      } catch (error) {
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
  };
}
