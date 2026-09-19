import { Dispatch, SetStateAction, useCallback, useRef } from 'react';
import { syncRecurringReminders } from '../reminders';

import {
  BillPayment,
  BillTrackerMeta,
  BudgetPlan,
  ExpenseWithItems,
  Member,
  RecurringBill,
	RecurringExpense,
  SavingsEntry,
  SavingsTrackerMeta,
  ShoppingItem,
  billApi,
  budgetApi,
  expenseApi,
  notificationApi,
  profileApi,
	 recurringExpenseApi,
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
	setRecurringExpenses: Dispatch<SetStateAction<RecurringExpense[]>>;
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
	setRecurringExpenses,
  setSavings,
  setSavingsTrackers,
  setSelectedPlanId,
  setShoppingItems,
}: UseProfileDataControllerOptions) {
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const lastRefreshRef = useRef(0);
  const currentUser = useRef(sessionUserId);
  currentUser.current = sessionUserId;
  const latestRequest = useRef(0);
  const reminderError = useRef<string | null>(null);

  const refreshProfileData = useCallback(
    async (profileId: string, force?: boolean) => {
      if (!sessionUserId) {
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
		  nextRecurringExpenses,
          nextPayments,
          nextSavings,
        ] = await Promise.all([
          profileApi.fetchMembers(profileId),
          budgetApi.fetchPlans(profileId),
          expenseApi.fetchProfileExpenses(profileId),
          shoppingApi.fetchItems(profileId),
          notificationApi.fetchForUser(profileId, sessionUserId),
          billApi.fetchTrackers(profileId),
          savingsApi.fetchTrackers(profileId),
          billApi.fetchRecurringBills(profileId),
		  recurringExpenseApi.fetch(profileId),
          billApi.fetchPayments(profileId),
          savingsApi.fetchSavings(profileId),
        ]);

        if (currentUser.current !== sessionUserId || request !== latestRequest.current) return;

        setMembers(nextMembers);
        setPlans(nextPlans);
        setProfileExpenses(nextExpenses);
        setShoppingItems(nextShopping);
        setNotifications(nextNotifications);
        setBillTrackers(nextBillTrackers);
        setSavingsTrackers(nextSavingsTrackers);
        setRecurringBills(nextBills);
		setRecurringExpenses(nextRecurringExpenses);
        // Reconcile from a successful server snapshot, including changes made on other devices.
        void syncRecurringReminders(profileId, nextRecurringExpenses)
          .then(() => { reminderError.current = null; })
          .catch((error) => {
            const message = error instanceof Error ? error.message : 'Could not restore scheduled reminders.';
            if (reminderError.current !== message) onError(message);
            reminderError.current = message;
          });
        setBillPayments(nextPayments);
        setSavings(nextSavings);
        nextNotifications.forEach((item) => seenNotificationIds.current.add(item.id));

        if (selectedPlanId && !nextPlans.some((plan) => plan.id === selectedPlanId)) {
          setSelectedPlanId(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Something went wrong.';
        onError(message);
      }
    },
    [
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
		setRecurringExpenses,
      setSavings,
      setSavingsTrackers,
      setSelectedPlanId,
      setShoppingItems,
    ],
  );

  return {
    refreshProfileData,
    seenNotificationIds,
  };
}
