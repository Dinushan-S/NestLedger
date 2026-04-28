import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Session } from '@supabase/supabase-js';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';

import {
  avatarChoices,
  expenseCategories,
  expenseFilters,
  formatShortDate,
  monthNames,
  monthShort,
  rs,
  shoppingCategories,
  shoppingFilters,
  startOfMonth,
  startOfToday,
  startOfWeek,
  theme,
} from '../../constants/nestledger';
import {
  AppNotification,
  BudgetPlan,
  Expense,
  ExpenseWithItems,
  HouseholdProfile,
  Member,
  ShoppingItem,
  UserProfile,
  authApi,
  budgetApi,
  expenseApi,
  inviteApi,
  notificationApi,
  profileApi,
  pushApi,
  shoppingApi,
  validateSession,
} from '../../lib/nestledger';
import { supabase } from '../../lib/supabase';
import { appConfig, isConfigReady } from '../../lib/config';
import BentoCard from '../ui/BentoCard';
import CategoryChip from '../ui/CategoryChip';
import ModernButton from '../ui/ModernButton';
import ProgressBar from '../ui/ProgressBar';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Props = {
  initialInviteToken?: string;
};

type TabKey = 'dashboard' | 'budget' | 'shopping' | 'profile';

type CreateProfileForm = {
  avatarEmoji: string;
  familyEmoji: string;
  familyName: string;
  name: string;
};

type BudgetForm = {
  endDate: string;
  name: string;
  startDate: string;
  totalAmount: string;
};

type ExpenseFormItem = {
  name: string;
  price: string;
};

type ExpenseForm = {
  category: string;
  customCategory: string;
  date: string;
  description: string;
  items: ExpenseFormItem[];
  is_borrow: boolean;
  paidBy: string | null;
  usedBy: string | null;
};

type BorrowForm = {
  amount: string;
  date: string;
  description: string;
};

type RepayForm = {
  amount: string;
  borrowId: string;
  date: string;
};

type ShoppingForm = {
  category: string;
  name: string;
  quantity: string;
};

const defaultCreateProfileForm: CreateProfileForm = {
  avatarEmoji: avatarChoices[0],
  familyEmoji: avatarChoices[1],
  familyName: '',
  name: '',
};

const defaultBudgetForm = (): BudgetForm => {
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 30);

  return {
    endDate: nextMonth.toISOString().slice(0, 10),
    name: '',
    startDate: today,
    totalAmount: '',
  };
};

const defaultExpenseForm = (): ExpenseForm => ({
  category: expenseCategories[0].key,
  customCategory: '',
  date: new Date().toISOString().slice(0, 10),
  description: '',
  items: [{ name: '', price: '' }],
  is_borrow: false,
  paidBy: null,
  usedBy: null,
});

const defaultShoppingForm: ShoppingForm = {
  category: '',
  name: '',
  quantity: '',
};

const defaultBudgetView = expenseFilters[1];

const extractError = (error: unknown) => {
  console.log('extractError called with:', error);
  
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const errorObj = error as any;
    if (errorObj.message) {
      return errorObj.message;
    }
    if (errorObj.error?.message) {
      return errorObj.error.message;
    }
    if (errorObj.details) {
      return errorObj.details;
    }
  }

  return 'Something went wrong.';
};

const isSchemaMissing = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('schema cache') ||
    normalized.includes('relation') ||
    normalized.includes('does not exist') ||
    normalized.includes('could not find the table')
  );
};

const notificationTypes = {
  expense: 'expense_added',
  join: 'member_joined',
  shoppingAdded: 'shopping_item_added',
  shoppingBought: 'shopping_item_bought',
};

export default function NestLedgerApp({ initialInviteToken }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 720;
  const bentoWidth = isTablet ? (width - 72) / 2 : width - 40;

  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [pendingInviteToken, setPendingInviteToken] = useState(initialInviteToken ?? null);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profiles, setProfiles] = useState<HouseholdProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<BudgetPlan[]>([]);
  const [profileExpenses, setProfileExpenses] = useState<ExpenseWithItems[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [showBudgetComposer, setShowBudgetComposer] = useState(false);
  const [showExpenseComposer, setShowExpenseComposer] = useState(false);
  const [showExpenseFilters, setShowExpenseFilters] = useState(false);
  const [showBorrowComposer, setShowBorrowComposer] = useState(false);
  const [showRepayComposer, setShowRepayComposer] = useState(false);
  const [editingBorrowId, setEditingBorrowId] = useState<string | null>(null);
  const [borrowForm, setBorrowForm] = useState<BorrowForm>({ amount: '', date: new Date().toISOString().slice(0, 10), description: '' });
  const [repayForm, setRepayForm] = useState<RepayForm>({ amount: '', borrowId: '', date: new Date().toISOString().slice(0, 10) });
  const [showShoppingComposer, setShowShoppingComposer] = useState(false);
  const [showBoughtComposer, setShowBoughtComposer] = useState(false);
  const [boughtForm, setBoughtForm] = useState({ price: '', paidBy: null as string | null, planId: '' });
  const [pendingBoughtItem, setPendingBoughtItem] = useState<ShoppingItem | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('20:00'); // Default 8 PM

  const [confirmModal, setConfirmModal] = useState<{
    body: string;
    confirmText?: string;
    destructive?: boolean;
    onConfirm: () => void;
    title: string;
    visible: boolean;
  } | null>(null);

  const [profileForm, setProfileForm] = useState<CreateProfileForm>(defaultCreateProfileForm);
  const [budgetForm, setBudgetForm] = useState<BudgetForm>(defaultBudgetForm());
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(defaultExpenseForm());
  const [shoppingForm, setShoppingForm] = useState<ShoppingForm>(defaultShoppingForm);
  const [inviteEmail, setInviteEmail] = useState('');
  const [lastInviteLink, setLastInviteLink] = useState('');
  const [expenseView, setExpenseView] = useState<(typeof expenseFilters)[number]>(defaultBudgetView);
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('All');
  const [shoppingFilter, setShoppingFilter] = useState<(typeof shoppingFilters)[number]>('All');

  const [deletingProfileIds, setDeletingProfileIds] = useState<Set<string>>(new Set());
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [budgetEditMode, setBudgetEditMode] = useState(false);

  const [activeViewYear, setActiveViewYear] = useState<number>(new Date().getFullYear());
  const [activeViewMonth, setActiveViewMonth] = useState<number | 'current'>('current');

  const seenNotificationIds = useRef<Set<string>>(new Set());
  const lastRefreshRef = useRef<number>(0);
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [activeProfileId, profiles],
  );
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const availableViewYears = useMemo(() => {
    if (!selectedPlan) return [new Date().getFullYear()];
    const planExpenses = profileExpenses.filter((e) => e.plan_id === selectedPlan.id);
    const years = new Set<number>();
    years.add(new Date(selectedPlan.start_date).getFullYear());
    years.add(new Date().getFullYear());
    if (selectedPlan.end_date) years.add(new Date(selectedPlan.end_date).getFullYear());
    planExpenses.forEach((e) => years.add(new Date(e.date).getFullYear()));
    return [...years].sort();
  }, [profileExpenses, selectedPlan]);

  const availableViewMonths = useMemo(() => {
    if (!selectedPlan) return [];
    const planExpenses = profileExpenses.filter((e) => e.plan_id === selectedPlan.id);
    const months = new Set<number>();
    planExpenses.forEach((e) => {
      if (new Date(e.date).getFullYear() === activeViewYear) {
        months.add(new Date(e.date).getMonth() + 1);
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
  }, [profileExpenses, selectedPlan, activeViewYear]);

  const isViewingArchive = activeViewMonth !== 'current';

  const monthFilteredExpenses = useMemo(() => {
    if (!selectedPlan || activeViewMonth === 'current') return null;
    return profileExpenses.filter((e) => {
      if (e.plan_id !== selectedPlan.id) return false;
      const d = new Date(e.date);
      return d.getFullYear() === activeViewYear && d.getMonth() + 1 === activeViewMonth;
    });
  }, [profileExpenses, selectedPlan, activeViewYear, activeViewMonth]);

  const memberMap = useMemo(() => {
    return new Map(
      members.map((member) => [
        member.user_id,
        {
          avatar: member.user_profile?.avatar_emoji ?? '🏡',
          email: member.user_profile?.email ?? '',
          name: member.user_profile?.name ?? 'Member',
        },
      ]),
    );
  }, [members]);

  const currentPlanExpenses = useMemo(() => {
    return profileExpenses.filter((expense) => {
      const plan = plans.find((p) => p.id === expense.plan_id);
      if (!plan) return true;
      if (expense.is_borrow) return true;
      return new Date(expense.date) >= new Date(plan.start_date);
    });
  }, [profileExpenses, plans]);

  const spentByPlan = useMemo(() => {
    return currentPlanExpenses
      .filter((expense) => !expense.paid_by && !expense.is_borrow)
      .reduce<Record<string, number>>((accumulator, expense) => {
        accumulator[expense.plan_id] = (accumulator[expense.plan_id] ?? 0) + Number(expense.price ?? 0);
        return accumulator;
      }, {});
  }, [currentPlanExpenses]);

  const contributionsByPlan = useMemo(() => {
    return currentPlanExpenses
      .filter((expense) => expense.paid_by && !expense.is_borrow)
      .reduce<Record<string, number>>((accumulator, expense) => {
        accumulator[expense.plan_id] = (accumulator[expense.plan_id] ?? 0) + Number(expense.price ?? 0);
        return accumulator;
      }, {});
  }, [currentPlanExpenses]);

  const borrowedByPlan = useMemo(() => {
    return currentPlanExpenses
      .filter((expense) => expense.is_borrow && expense.price > 0)
      .reduce<Record<string, number>>((accumulator, expense) => {
        accumulator[expense.plan_id] = (accumulator[expense.plan_id] ?? 0) + Number(expense.price ?? 0);
        return accumulator;
      }, {});
  }, [currentPlanExpenses]);

  const repaidByPlan = useMemo(() => {
    return currentPlanExpenses
      .filter((expense) => expense.is_borrow && expense.price < 0)
      .reduce<Record<string, number>>((accumulator, expense) => {
        accumulator[expense.plan_id] = (accumulator[expense.plan_id] ?? 0) + Math.abs(Number(expense.price ?? 0));
        return accumulator;
      }, {});
  }, [currentPlanExpenses]);

  const personalContributions = useMemo(() => {
    const contributions: Record<string, { member: { avatar: string; name: string }; total: number }> = {};
    currentPlanExpenses.forEach((expense) => {
      if (expense.paid_by && !expense.is_borrow) {
        const member = memberMap.get(expense.paid_by);
        if (member) {
          if (!contributions[expense.paid_by]) {
            contributions[expense.paid_by] = { member, total: 0 };
          }
          contributions[expense.paid_by].total += Number(expense.price ?? 0);
        }
      }
    });
    return contributions;
  }, [currentPlanExpenses, memberMap]);

  const memberBorrowBalances = useMemo(() => {
    const balances: Record<string, { member: { avatar: string; name: string }; contributed: number; borrowed: number; repaid: number; owes: number }> = {};
    currentPlanExpenses.forEach((expense) => {
      if (!expense.is_borrow) return;
      const userId = expense.used_by ?? expense.added_by;
      const member = memberMap.get(userId);
      if (!member) return;
      if (!balances[userId]) balances[userId] = { member, contributed: 0, borrowed: 0, repaid: 0, owes: 0 };
      if (expense.price > 0) balances[userId].borrowed += expense.price;
      else balances[userId].repaid += Math.abs(expense.price);
    });
    Object.entries(personalContributions).forEach(([userId, data]) => {
      if (!balances[userId]) balances[userId] = { member: data.member, contributed: 0, borrowed: 0, repaid: 0, owes: 0 };
      balances[userId].contributed = data.total;
    });
    Object.values(balances).forEach((bal) => {
      bal.owes = Math.max(bal.borrowed - bal.repaid - bal.contributed, 0);
    });
    return balances;
  }, [currentPlanExpenses, memberMap, personalContributions]);

  const familyBudgetSpent = useMemo(() => {
    return profileExpenses
      .filter((expense) => !expense.paid_by && !expense.is_borrow)
      .reduce((total, expense) => total + Number(expense.price ?? 0), 0);
  }, [profileExpenses]);

  const filteredShoppingItems = useMemo(() => {
    if (shoppingFilter === 'Pending') {
      return shoppingItems.filter((item) => !item.is_bought);
    }

    if (shoppingFilter === 'Bought') {
      return shoppingItems.filter((item) => item.is_bought);
    }

    return shoppingItems;
  }, [shoppingFilter, shoppingItems]);

  const filteredExpenses = useMemo(() => {
    if (!selectedPlan) {
      return [];
    }

    const planStartDate = new Date(selectedPlan.start_date);
    const base = profileExpenses.filter((expense) => expense.plan_id === selectedPlan.id && !expense.is_borrow && new Date(expense.date) >= planStartDate);
    const today = startOfToday();
    const weekStart = startOfWeek();
    const monthStart = startOfMonth();

    return base.filter((expense) => {
      const expenseDate = new Date(expense.date);
      const matchesWindow =
        expenseView === 'Day'
          ? expenseDate >= today
          : expenseView === 'Week'
            ? expenseDate >= weekStart
            : expenseDate >= monthStart;

      const matchesCategory = expenseCategoryFilter === 'All' || expense.category === expenseCategoryFilter;
      return matchesWindow && matchesCategory;
    });
  }, [expenseCategoryFilter, expenseView, profileExpenses, selectedPlan]);

  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const shoppingBadgeCount = notifications.filter(
    (item) => !item.is_read && item.type.startsWith('shopping_'),
  ).length;

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      if (!isConfigReady) {
        setBooting(false);
        return;
      }

      try {
        const currentSession = await authApi.getSession();
        if (mounted) {
          setSession(currentSession);
        }
      } catch (error) {
        if (mounted) {
          setSetupMessage(extractError(error));
        }
      } finally {
        if (mounted) {
          setBooting(false);
        }
      }
    };

    initialize();

    const subscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfiles([]);
        setActiveProfileId(null);
        setUserProfile(null);
        setProfileLoaded(false);
        setMembers([]);
        setPlans([]);
        setProfileExpenses([]);
        setShoppingItems([]);
        setNotifications([]);
      }
    });

    return () => {
      mounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  // Load reminder settings
  useEffect(() => {
    const loadReminderSettings = async () => {
      try {
        const savedEnabled = await AsyncStorage.getItem('nestledger-reminder-enabled');
        const savedTime = await AsyncStorage.getItem('nestledger-reminder-time');
        if (savedEnabled !== null) {
          setReminderEnabled(savedEnabled === 'true');
        }
        if (savedTime !== null) {
          setReminderTime(savedTime);
        }
      } catch (error) {
        console.error('Error loading reminder settings:', error);
      }
    };
    loadReminderSettings();
  }, []);

  const scheduleReminder = async (time: string) => {
    if (!Device.isDevice) return;

    const [hours, minutes] = time.split(':').map(Number);

    await Notifications.cancelAllScheduledNotificationsAsync();

    if (reminderEnabled) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'NestLedger Reminder',
          body: "Don't forget to add your expenses for today!",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: hours,
          minute: minutes,
        },
      });
      console.log(`Reminder scheduled for ${time}`);
    }
  };

  const toggleReminder = async (enabled: boolean) => {
    setReminderEnabled(enabled);
    await AsyncStorage.setItem('nestledger-reminder-enabled', String(enabled));
    
    if (enabled) {
      await scheduleReminder(reminderTime);
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  };

  const updateReminderTime = async (time: string) => {
    setReminderTime(time);
    await AsyncStorage.setItem('nestledger-reminder-time', time);
    
    if (reminderEnabled) {
      await scheduleReminder(time);
    }
  };

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    const bootstrap = async () => {
      setBusy(true);

      try {
        const [nextUserProfile, nextProfiles] = await Promise.all([
          profileApi.fetchUserProfile(session.user.id),
          profileApi.fetchAccessibleProfiles(session.user.id),
        ]);

        setUserProfile(nextUserProfile);
        setProfiles(nextProfiles);
        setProfileLoaded(true);

        const savedId = await AsyncStorage.getItem(`nestledger-active-profile-${session.user.id}`);
        const fallback = nextProfiles.find((item) => item.id === savedId)?.id ?? nextProfiles[0]?.id ?? null;
        setActiveProfileId((previous) => previous ?? fallback);
        setSetupMessage(null);
      } catch (error) {
        const message = extractError(error);
        setProfileLoaded(true);
        if (isSchemaMissing(message)) {
          setSetupMessage(
            'Supabase tables are not ready yet. Run /app/backend/supabase_schema.sql in Supabase SQL Editor or send the Transaction Pooler URI so I can apply it for you.',
          );
        } else {
          setSetupMessage(message);
        }
      } finally {
        setBusy(false);
      }
    };

    bootstrap();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user || !activeProfileId) {
      return;
    }

    AsyncStorage.setItem(`nestledger-active-profile-${session.user.id}`, activeProfileId).catch(() => undefined);
  }, [activeProfileId, session?.user]);

  useEffect(() => {
    if (!session?.user || !activeProfileId) {
      return;
    }

    refreshProfileData(activeProfileId);
  }, [activeProfileId, session?.user?.id]);

  useEffect(() => {
    if (!session?.user || !activeProfileId) {
      return;
    }

    const channel = supabase
      .channel(`nestledger-${activeProfileId}-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: '*', filter: `profile_id=eq.${activeProfileId}`, schema: 'public', table: 'budget_plans' },
        (payload) => {
          console.log('Budget plan change detected:', payload);
          refreshProfileData(activeProfileId);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', filter: `profile_id=eq.${activeProfileId}`, schema: 'public', table: 'expenses' },
        (payload) => {
          console.log('Expense change detected:', payload);
          refreshProfileData(activeProfileId);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expense_items' },
        (payload) => {
          console.log('Expense item change detected:', payload);
          refreshProfileData(activeProfileId);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', filter: `profile_id=eq.${activeProfileId}`, schema: 'public', table: 'buy_list_items' },
        (payload) => {
          console.log('Shopping item change detected:', payload);
          refreshProfileData(activeProfileId);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', filter: `profile_id=eq.${activeProfileId}`, schema: 'public', table: 'profile_members' },
        (payload) => {
          console.log('Profile member change detected:', payload);
          refreshProfileData(activeProfileId);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', filter: `user_id=eq.${session.user.id}`, schema: 'public', table: 'notifications' },
        async (payload) => {
          console.log('Notification change detected:', payload);
          const nextPayload = payload as { eventType: string; new?: { id?: string; message?: string } };
          const nextId = nextPayload.new?.id;
          const nextMessage = nextPayload.new?.message;
          const shouldNotify = nextPayload.eventType === 'INSERT' && nextId && !seenNotificationIds.current.has(nextId);

          if (nextId) {
            seenNotificationIds.current.add(nextId);
          }

          if (shouldNotify && nextMessage) {
            await Notifications.scheduleNotificationAsync({
              content: {
                body: nextMessage,
                title: 'NestLedger update',
              },
              trigger: null,
            }).catch(() => undefined);
          }

          refreshProfileData(activeProfileId);
        },
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeProfileId, session?.user?.id]);

  useEffect(() => {
    if (!selectedPlanId) return;
    setActiveViewYear(new Date().getFullYear());
    setActiveViewMonth('current');
  }, [selectedPlanId]);

  useEffect(() => {
    if (!session || !pendingInviteToken) {
      return;
    }

    acceptInviteFlow(pendingInviteToken);
  }, [pendingInviteToken, session?.access_token]);

  useEffect(() => {
    if (!session || !Device.isDevice) {
      return;
    }

    const register = async () => {
      try {
        const permissions = await Notifications.requestPermissionsAsync();
        if (permissions.status !== 'granted') {
          return;
        }

        const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

        if (!projectId) {
          return;
        }

        const token = await Notifications.getExpoPushTokenAsync({ projectId });
        await pushApi.registerToken(validateSession(session), token.data, Platform.OS);
      } catch {
        // Silent: preview and unmanaged environments may not expose push tokens.
      }
    };

    register();
  }, [session?.access_token]);

  const refreshProfileData = async (profileId: string, force?: boolean) => {
    if (!session?.user) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastRefreshRef.current < 1000) {
      return;
    }
    lastRefreshRef.current = now;

    try {
      const [nextMembers, nextPlans, nextExpenses, nextShopping, nextNotifications] = await Promise.all([
        profileApi.fetchMembers(profileId),
        budgetApi.fetchPlans(profileId),
        expenseApi.fetchProfileExpenses(profileId),
        shoppingApi.fetchItems(profileId),
        notificationApi.fetchForUser(profileId, session.user.id),
      ]);

      setMembers(nextMembers);
      setPlans(nextPlans);
      setProfileExpenses(nextExpenses);
      setShoppingItems(nextShopping);
      setNotifications(nextNotifications);
      nextNotifications.forEach((item) => seenNotificationIds.current.add(item.id));
      if (selectedPlanId && !nextPlans.some((plan) => plan.id === selectedPlanId)) {
        setSelectedPlanId(null);
      }
    } catch (error) {
      const message = extractError(error);
      setSetupMessage(message);
    }
  };

  const announce = (message: string) => {
    if (Platform.OS === 'web') {
      globalThis.alert?.(message);
      return;
    }

    Alert.alert('NestLedger', message);
  };

  const showConfirm = (options: {
    body: string;
    confirmText?: string;
    destructive?: boolean;
    onConfirm: () => void;
    title: string;
  }) => {
    setConfirmModal({ ...options, visible: true });
  };

  const closeConfirm = () => {
    setConfirmModal(null);
  };

  const runAction = async (callback: () => Promise<void>) => {
    setActionBusy(true);
    try {
      await callback();
    } catch (error) {
      console.error('runAction error:', error);
      console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      announce(extractError(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleAuth = async () => {
    if (!authForm.email || !authForm.password) {
      setAuthMessage('Enter your email and password to continue.');
      return;
    }

    setAuthBusy(true);
    setAuthMessage(null);

    try {
      if (authMode === 'signin') {
        await authApi.signIn(authForm);
      } else {
        const result = await authApi.signUp(authForm);
        if (!result.session) {
          setAuthMessage('Account created. Please confirm your email, then sign in.');
          setAuthMode('signin');
        }
      }
    } catch (error) {
      setAuthMessage(extractError(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCreateProfile = async () => {
    if (!session?.user) {
      return;
    }

    if (!profileForm.name.trim() || !profileForm.familyName.trim()) {
      announce('Add your name and the family profile name first.');
      return;
    }

    await runAction(async () => {
      const profile = await profileApi.createHousehold({
        avatarEmoji: profileForm.avatarEmoji,
        familyEmoji: profileForm.familyEmoji,
        familyName: profileForm.familyName,
        name: profileForm.name,
        user: session.user,
      });

      setProfileForm(defaultCreateProfileForm);
      setShowCreateProfile(false);
      setShowProfileSwitcher(false);
      const [nextUserProfile, nextProfiles] = await Promise.all([
        profileApi.fetchUserProfile(session.user.id),
        profileApi.fetchAccessibleProfiles(session.user.id),
      ]);
      setUserProfile(nextUserProfile);
      setProfiles(nextProfiles);
      setActiveProfileId(profile.id);
    });
  };

  const handleCreateBudget = async () => {
    if (!session?.user || !activeProfile) {
      return;
    }

    if (!budgetForm.name.trim() || !budgetForm.totalAmount.trim()) {
      announce('Add a plan name and total budget amount.');
      return;
    }

    await runAction(async () => {
      if (editingPlanId) {
        await budgetApi.updatePlan(editingPlanId, {
          end_date: budgetForm.endDate,
          name: budgetForm.name,
          start_date: budgetForm.startDate,
          total_amount: Number(budgetForm.totalAmount),
        });
        setEditingPlanId(null);
      } else {
        await budgetApi.createPlan({
          created_by: session.user.id,
          end_date: budgetForm.endDate,
          name: budgetForm.name,
          profile_id: activeProfile.id,
          start_date: budgetForm.startDate,
          total_amount: Number(budgetForm.totalAmount),
        });
      }

      setBudgetForm(defaultBudgetForm());
      setShowBudgetComposer(false);
      await refreshProfileData(activeProfile.id, true);
    });
  };

  const handleEditBudget = (plan: BudgetPlan) => {
    setEditingPlanId(plan.id);
    setBudgetForm({
      endDate: plan.end_date,
      name: plan.name,
      startDate: plan.start_date,
      totalAmount: String(plan.total_amount),
    });
    setBudgetEditMode(false);
    setShowBudgetComposer(true);
  };

  const handleDeleteBudget = async (planId: string, planName: string) => {
    if (!activeProfile) {
      return;
    }

    showConfirm({
      body: `Are you sure you want to delete "${planName}"? This will also delete all expenses associated with it.`,
      confirmText: 'Delete',
      destructive: true,
      onConfirm: () => {
        runAction(async () => {
          await budgetApi.deletePlan(planId);
          setSelectedPlanId(null);
          setPlans((prev) => prev.filter((p) => p.id !== planId));
          await refreshProfileData(activeProfile.id, true);
        });
      },
      title: 'Delete Budget Plan',
    });
  };

  const handleResetBudget = async (planId: string, planName: string) => {
    if (!activeProfile) {
      return;
    }

    showConfirm({
      body: `Clear all expenses and borrows for "${planName}"? This cannot be undone.`,
      confirmText: 'Reset',
      destructive: true,
      onConfirm: () => {
        runAction(async () => {
          await expenseApi.clearPlanExpenses(planId);
          await refreshProfileData(activeProfile.id, true);
        });
      },
      title: 'Reset Budget',
    });
  };

  const notifyOtherMembers = async (message: string, type: string) => {
    if (!session?.user || !activeProfile) {
      return;
    }

    const recipients = members.filter((item) => item.user_id !== session.user.id).map((item) => item.user_id);
    if (!recipients.length) {
      return;
    }

    await notificationApi.createForMembers(activeProfile.id, recipients, message, type);
    await pushApi.fanOut(validateSession(session), {
      exclude_user_id: session.user.id,
      message,
      profile_id: activeProfile.id,
      type,
    }).catch(() => undefined);
  };

  const handleAddExpense = async () => {
    console.log('handleAddExpense called');
    console.log('session:', session?.user?.id);
    console.log('activeProfile:', activeProfile?.id);
    console.log('selectedPlan:', selectedPlan?.id);
    
    if (!session?.user || !activeProfile || !selectedPlan) {
      console.error('Missing required data for expense');
      return;
    }

    const validItems = expenseForm.items.filter(item => item.name.trim() && item.price.trim());
    console.log('Valid items:', validItems);
    
    if (validItems.length === 0) {
      announce('Add at least one item with name and price.');
      return;
    }

    if (expenseForm.category === 'Other' && !expenseForm.customCategory.trim()) {
      announce('Please enter a custom category name.');
      return;
    }

    const category = expenseForm.category === 'Other' ? expenseForm.customCategory.trim() : expenseForm.category;
    const items = validItems.map(item => ({
      name: item.name.trim(),
      price: Number(item.price),
    }));
    
    console.log('Processed items:', items);

    await runAction(async () => {
      try {
        if (editingExpenseId) {
          console.log('Updating expense:', editingExpenseId);
          await expenseApi.updateExpense(
            editingExpenseId,
            {
              category,
              date: new Date(expenseForm.date).toISOString(),
              description: expenseForm.description.trim() || null,
              paid_by: expenseForm.paidBy,
              used_by: expenseForm.paidBy === null ? expenseForm.usedBy : null,
            } as any,
            items
          );
        } else {
          console.log('Adding new expense');
          await expenseApi.addExpense({
            added_by: session.user.id,
            category,
            date: new Date(expenseForm.date).toISOString(),
            description: expenseForm.description.trim() || null,
            is_borrow: expenseForm.is_borrow,
            items,
            paid_by: expenseForm.paidBy,
            plan_id: selectedPlan.id,
            profile_id: selectedPlan.profile_id,
            used_by: expenseForm.paidBy === null ? expenseForm.usedBy : null,
          });
          const itemNames = items.map(i => i.name).join(', ');
          await notifyOtherMembers(`${userProfile?.name ?? 'A member'} added ${itemNames} to ${selectedPlan.name}.`, notificationTypes.expense);
        }
        console.log('Expense saved successfully');
        
        setExpenseForm(defaultExpenseForm());
        setEditingExpenseId(null);
        setShowExpenseComposer(false);
        await refreshProfileData(activeProfile.id, true);
      } catch (error) {
        console.error('Error in handleAddExpense:', error);
        throw error;
      }
    });
  };

  const startEditBorrow = (expense: ExpenseWithItems) => {
    const items = expense.items ?? [];
    const totalAmount = items.reduce((sum, item) => sum + Number(item.price), 0);
    setBorrowForm({
      amount: String(Math.abs(totalAmount)),
      date: expense.date,
      description: expense.description || '',
    });
    setEditingBorrowId(expense.id);
    setShowBorrowComposer(true);
  };

  const handleBorrow = async () => {
    if (!session?.user || !activeProfile || !selectedPlan) return;
    const amount = Number(borrowForm.amount);
    if (!amount || amount <= 0) {
      announce('Enter a valid amount to borrow.');
      return;
    }

    await runAction(async () => {
      if (editingBorrowId) {
        await expenseApi.updateExpense(
          editingBorrowId,
          {
            date: new Date(borrowForm.date).toISOString(),
            description: borrowForm.description.trim() || null,
          },
          [{ name: borrowForm.description.trim() || 'Borrowed from budget', price: amount }]
        );
        setEditingBorrowId(null);
      } else {
        await expenseApi.addExpense({
          added_by: session.user.id,
          category: 'Borrow',
          date: new Date(borrowForm.date).toISOString(),
          description: borrowForm.description.trim() || null,
          is_borrow: true,
          items: [{ name: borrowForm.description.trim() || 'Borrowed from budget', price: amount }],
          paid_by: null,
          plan_id: selectedPlan.id,
          profile_id: selectedPlan.profile_id,
          used_by: session.user.id,
        });
      }
      setBorrowForm({ amount: '', date: new Date().toISOString().slice(0, 10), description: '' });
      setShowBorrowComposer(false);
      await refreshProfileData(activeProfile.id, true);
    });
  };

  const handleRepay = async () => {
    if (!session?.user || !activeProfile || !selectedPlan) return;
    const amount = Number(repayForm.amount);
    if (!amount || amount <= 0) {
      announce('Enter a valid amount to repay.');
      return;
    }

    await runAction(async () => {
      await expenseApi.addExpense({
        added_by: session.user.id,
        category: 'Repay',
        date: repayForm.date,
        description: 'Repayment to budget',
        is_borrow: true,
        items: [{ name: 'Repayment to budget', price: -amount }],
        paid_by: null,
        plan_id: selectedPlan.id,
        profile_id: selectedPlan.profile_id,
        used_by: session.user.id,
      });
      setRepayForm({ amount: '', borrowId: '', date: new Date().toISOString().slice(0, 10) });
      setShowRepayComposer(false);
      await refreshProfileData(activeProfile.id, true);
    });
  };

  const addExpenseItem = () => {
    setExpenseForm(current => ({
      ...current,
      items: [...current.items, { name: '', price: '' }],
    }));
  };

  const removeExpenseItem = (index: number) => {
    if (expenseForm.items.length > 1) {
      setExpenseForm(current => ({
        ...current,
        items: current.items.filter((_, i) => i !== index),
      }));
    }
  };

  const updateExpenseItem = (index: number, field: 'name' | 'price', value: string) => {
    setExpenseForm(current => ({
      ...current,
      items: current.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const expenseTotal = expenseForm.items.reduce((sum, item) => {
    const price = parseFloat(item.price);
    return sum + (isNaN(price) ? 0 : price);
  }, 0);

  const startEditExpense = (expense: ExpenseWithItems) => {
    setEditingExpenseId(expense.id);
    setExpenseForm({
      category: expenseCategories.find((c) => c.key === expense.category)?.key ?? 'Other',
      customCategory: expenseCategories.find((c) => c.key === expense.category) ? '' : expense.category,
      date: expense.date.slice(0, 10),
      description: expense.description || '',
      items: expense.items?.length > 0 
        ? expense.items.map(item => ({ name: item.name, price: String(item.price) }))
        : [{ name: '', price: '' }],
      is_borrow: expense.is_borrow,
      paidBy: expense.paid_by,
      usedBy: expense.used_by,
    });
    setShowExpenseComposer(true);
  };

  const handleDeleteExpense = async (expenseId: string, expenseTitle: string) => {
    if (!activeProfile) {
      announce('No active profile selected.');
      return;
    }

    showConfirm({
      body: `Are you sure you want to delete "${expenseTitle}"?`,
      confirmText: 'Delete',
      destructive: true,
      onConfirm: () => {
        runAction(async () => {
          await expenseApi.deleteExpense(expenseId);
          await refreshProfileData(activeProfile.id, true);
        });
      },
      title: 'Delete Expense',
    });
  };

  const handleAddShoppingItem = async () => {
    if (!session?.user || !activeProfile) {
      return;
    }

    if (!shoppingForm.name.trim()) {
      announce('Add the product name first.');
      return;
    }

    await runAction(async () => {
      await shoppingApi.addItem({
        added_by: session.user.id,
        category: shoppingForm.category || null,
        name: shoppingForm.name.trim(),
        profile_id: activeProfile.id,
        quantity: shoppingForm.quantity || null,
      });

      await notifyOtherMembers(
        `${userProfile?.name ?? 'A member'} added ${shoppingForm.name} to the shopping list.`,
        notificationTypes.shoppingAdded,
      );
      setShoppingForm(defaultShoppingForm);
      setShowShoppingComposer(false);
      await refreshProfileData(activeProfile.id, true);
    });
  };

  const handleMarkBought = async (item: ShoppingItem) => {
    if (!session?.user || !activeProfile) {
      return;
    }

    if (item.is_bought) {
      await runAction(async () => {
        if (item.linked_expense_id) {
          await expenseApi.deleteExpense(item.linked_expense_id);
        }
        await shoppingApi.markUnbought(item.id);
        await refreshProfileData(activeProfile.id, true);
      });
    } else {
      setPendingBoughtItem(item);
      setBoughtForm({ price: '', paidBy: null, planId: plans[0]?.id ?? '' });
      setShowBoughtComposer(true);
    }
  };

  const handleConfirmBought = async () => {
    if (!session?.user || !activeProfile || !pendingBoughtItem) return;
    const price = Number(boughtForm.price);
    if (!price || price <= 0) {
      announce('Enter a valid price.');
      return;
    }
    if (!boughtForm.planId) {
      announce('Select a budget plan.');
      return;
    }

    const plan = plans.find(p => p.id === boughtForm.planId);
    if (!plan) {
      announce('Budget plan not found.');
      return;
    }

    await runAction(async () => {
      const itemDescription = pendingBoughtItem.quantity 
        ? `${pendingBoughtItem.name} (Qty: ${pendingBoughtItem.quantity})`
        : pendingBoughtItem.name;

      const newExpense = await expenseApi.addExpenseWithId({
        added_by: session.user.id,
        category: pendingBoughtItem.category || 'Groceries',
        date: new Date().toISOString(),
        description: pendingBoughtItem.category || null,
        is_borrow: false,
        items: [{ name: itemDescription, price }],
        paid_by: boughtForm.paidBy,
        plan_id: boughtForm.planId,
        profile_id: activeProfile.id,
        used_by: boughtForm.paidBy,
      });

      await shoppingApi.markBought(pendingBoughtItem.id, session.user.id, newExpense.id);
      await notifyOtherMembers(
        `${userProfile?.name ?? 'A member'} bought ${pendingBoughtItem.name} for ${rs(price)} ✓`,
        notificationTypes.shoppingBought,
      );

      setShowBoughtComposer(false);
      setPendingBoughtItem(null);
      setBoughtForm({ price: '', paidBy: null, planId: '' });
      await refreshProfileData(activeProfile.id, true);
    });
  };

  const handleDeleteShoppingItem = async (itemId: string, itemName: string) => {
    if (!activeProfile) {
      announce('No active profile selected.');
      return;
    }

    showConfirm({
      body: `Are you sure you want to delete "${itemName}"?`,
      confirmText: 'Delete',
      destructive: true,
      onConfirm: () => {
        runAction(async () => {
          await shoppingApi.deleteItem(itemId);
          await refreshProfileData(activeProfile.id, true);
        });
      },
      title: 'Delete Item',
    });
  };

  const handleSendInvite = async () => {
    if (!session || !activeProfile || !inviteEmail.trim()) {
      announce('Add the member email first.');
      return;
    }

    await runAction(async () => {
      const result = await inviteApi.sendInvite(validateSession(session), {
        invited_email: inviteEmail.trim(),
        inviter_name: userProfile?.name ?? 'A member',
        profile_id: activeProfile.id,
        profile_name: activeProfile.name,
      });

      setLastInviteLink(result.shareable_link);
      setInviteEmail('');
      announce('Invitation sent. You can also copy or share the invite link.');
    });
  };

  const acceptInviteFlow = async (token: string) => {
    if (!session) {
      return;
    }

    await runAction(async () => {
      const result = await inviteApi.acceptInvite(validateSession(session), token);
      const nextProfiles = await profileApi.fetchAccessibleProfiles(session.user.id);
      setProfiles(nextProfiles);
      setActiveProfileId(result.profile_id);
      setPendingInviteToken(null);
      setShowProfileSwitcher(false);
      announce('Invitation accepted. Welcome to the shared home.');
    });
  };

  const handleSaveSettings = async () => {
    if (!session?.user || !activeProfile) {
      return;
    }

    await runAction(async () => {
      await profileApi.upsertUserProfile(session.user, {
        avatarEmoji: profileForm.avatarEmoji,
        name: profileForm.name,
      });
      await profileApi.updateHousehold(activeProfile.id, {
        emoji_avatar: profileForm.familyEmoji,
        name: profileForm.familyName,
      });

      const [nextUserProfile, nextProfiles] = await Promise.all([
        profileApi.fetchUserProfile(session.user.id),
        profileApi.fetchAccessibleProfiles(session.user.id),
      ]);
      setUserProfile(nextUserProfile);
      setProfiles(nextProfiles);
      setShowProfileSettings(false);
    });
  };

  const primeSettingsForm = () => {
    setProfileForm({
      avatarEmoji: userProfile?.avatar_emoji ?? avatarChoices[0],
      familyEmoji: activeProfile?.emoji_avatar ?? avatarChoices[1],
      familyName: activeProfile?.name ?? '',
      name: userProfile?.name ?? '',
    });
    setShowProfileSettings(true);
  };

  const handleDeleteSpace = async (profileId: string) => {
    if (!session?.user) {
      return;
    }

    const performDelete = async () => {
      const previousProfiles = [...profiles];
      const nextProfiles = profiles.filter((p) => p.id !== profileId);
      setProfiles(nextProfiles);
      setDeletingProfileIds((current) => new Set(current).add(profileId));

      if (activeProfileId === profileId) {
        setActiveProfileId(nextProfiles[0]?.id ?? null);
      }

      if (!nextProfiles.length) {
        setShowProfileSwitcher(false);
        setShowCreateProfile(true);
      }

      try {
        await profileApi.deleteHousehold(validateSession(session), profileId);
      } catch (error) {
        setProfiles(previousProfiles);
        announce(extractError(error));
      } finally {
        setDeletingProfileIds((current) => {
          const next = new Set(current);
          next.delete(profileId);
          return next;
        });
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = globalThis.confirm?.('Are you sure you want to delete this space? All data will be permanently removed.');
      if (!confirmed) {
        return;
      }
      performDelete();
    } else {
      showConfirm({
        body: 'Are you sure you want to delete this space? All data will be permanently removed.',
        confirmText: 'Delete',
        destructive: true,
        onConfirm: performDelete,
        title: 'Delete Space',
      });
    }
  };

  const monthlySpend = useMemo(() => {
    const monthStart = startOfMonth();
    return profileExpenses
      .filter((item) => new Date(item.date) >= monthStart)
      .reduce((total, item) => total + Number(item.price), 0);
  }, [profileExpenses]);

  const latestActivities = notifications.slice(0, 4);
  const activeBudget = plans[0];
  const activeBudgetSpent = activeBudget ? (spentByPlan[activeBudget.id] ?? 0) + (contributionsByPlan[activeBudget.id] ?? 0) + (borrowedByPlan[activeBudget.id] ?? 0) - (repaidByPlan[activeBudget.id] ?? 0) : 0;
  const pendingItemsCount = shoppingItems.filter((item) => !item.is_bought).length;

  if (!isConfigReady) {
    return (
      <CenteredState
        body="Supabase and backend config are missing in app.json extra values."
        title="NestLedger isn’t configured yet"
      />
    );
  }

  if (booting) {
    return <SplashScreen />;
  }

  if (!session) {
    return (
      <SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.authWrap}>
          <BentoCard tone="highlight" style={styles.authCard}>
            <Text style={styles.kicker}>NestLedger</Text>
            <Text style={styles.heroTitle}>Shared home budgeting without the chaos.</Text>
            <Text style={styles.bodyMuted}>
              Sign in with your email to manage budgets, expenses, shopping lists, and invites in real time.
            </Text>

            {pendingInviteToken ? (
              <View style={styles.inlineBanner}>
                <Ionicons color={theme.primary} name="mail-open-outline" size={18} />
                <Text style={styles.inlineBannerText}>Sign in first to accept your invitation.</Text>
              </View>
            ) : null}

            <View style={styles.segmentRow}>
              {(['signin', 'signup'] as const).map((mode) => (
                <CategoryChip
                  key={mode}
                  active={authMode === mode}
                  label={mode === 'signin' ? 'Sign in' : 'Register'}
                  onPress={() => setAuthMode(mode)}
                  testID={`auth-mode-${mode}`}
                />
              ))}
            </View>

            <LabeledInput label="Email" onChangeText={(value) => setAuthForm((current) => ({ ...current, email: value }))} testID="auth-email-input" value={authForm.email} />
            <LabeledInput
              label="Password"
              onChangeText={(value) => setAuthForm((current) => ({ ...current, password: value }))}
              secureTextEntry
              testID="auth-password-input"
              value={authForm.password}
            />

            {authMessage ? <Text style={styles.errorText}>{authMessage}</Text> : null}

            <ModernButton loading={authBusy} onPress={handleAuth} testID="auth-submit-button" text={authMode === 'signin' ? 'Continue' : 'Create account'} />
            <Text style={styles.footnote}>Supabase email confirmation is currently enabled for new registrations.</Text>
          </BentoCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (session && !profileLoaded) {
    return <SplashScreen />;
  }

  if (!userProfile || profiles.length === 0 || showCreateProfile) {
    const isFirstSetup = !userProfile || profiles.length === 0;
    return (
      <SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.authWrap}>
          <BentoCard tone="highlight" style={styles.authCard}>
            <Text style={styles.kicker}>{isFirstSetup ? 'Set up your shared home' : 'Create new space'}</Text>
            <Text style={styles.heroTitle}>{isFirstSetup ? 'Create your first NestLedger profile.' : 'Add another family space.'}</Text>
            <Text style={styles.bodyMuted}>{isFirstSetup ? 'This creates your member identity and the first family/home space.' : 'Create a separate budget space for another household or family.'}</Text>
            <ProfileFormFields form={profileForm} onChange={setProfileForm} />
            {setupMessage ? <Text style={styles.errorText}>{setupMessage}</Text> : null}
            <ModernButton loading={actionBusy} onPress={handleCreateProfile} testID="create-profile-submit" text={isFirstSetup ? 'Create NestLedger space' : 'Create space'} />
            {!isFirstSetup ? (
              <ModernButton onPress={() => setShowCreateProfile(false)} secondary testID="create-profile-cancel" text="Cancel" />
            ) : null}
          </BentoCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!activeProfile || showProfileSwitcher) {
    return (
      <SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.switcherWrap}>
          <View style={styles.switcherHeader}>
            <Text style={styles.kicker}>Choose profile</Text>
            <Text style={styles.sectionTitle}>Pick your family space</Text>
            <Text style={styles.bodyMuted}>All homes you’re part of appear here. You can also create a new one.</Text>
          </View>

          {profiles.map((profile) => (
            <Pressable
              key={profile.id}
              onLongPress={() => handleDeleteSpace(profile.id)}
              onPress={() => {
                setActiveProfileId(profile.id);
                setShowProfileSwitcher(false);
              }}
              delayLongPress={500}
              style={styles.switcherCard}
            >
              <Text style={styles.switcherEmoji}>{profile.emoji_avatar ?? '🏡'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{profile.name}</Text>
                <Text style={styles.bodyMuted}>Created {formatShortDate(profile.created_at)} • Hold to delete</Text>
              </View>
              <Ionicons color={theme.primary} name="chevron-forward" size={20} />
            </Pressable>
          ))}

            <ModernButton onPress={() => setShowCreateProfile(true)} secondary testID="profile-switcher-create" text="Create another space" />
          <ModernButton onPress={() => authApi.signOut()} secondary testID="profile-switcher-signout" text="Sign out" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.screen}>
      <SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.screen}>
          <View style={[styles.appShell, { paddingBottom: Math.max(16, insets.bottom) }]}> 
          <View style={styles.topBar}>
            <Pressable hitSlop={10} onPress={() => setShowProfileSwitcher(true)} style={styles.profileSwitcherButton} testID="open-profile-switcher">
              <Text style={styles.switcherEmoji}>{activeProfile.emoji_avatar ?? '🏡'}</Text>
              <View>
                <Text style={styles.topBarTitle}>{activeProfile.name}</Text>
                <Text style={styles.topBarSubtitle}>{userProfile.name}</Text>
              </View>
              <Ionicons color={theme.textMuted} name="chevron-down" size={16} />
            </Pressable>

            <Pressable hitSlop={10} onPress={() => setShowNotifications(true)} style={styles.bellButton} testID="open-notifications">
              <Ionicons color={theme.text} name="notifications-outline" size={22} />
              {unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{Math.min(unreadCount, 9)}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {busy ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={theme.primary} size="large" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.contentWrap} showsVerticalScrollIndicator={false}>
              {setupMessage ? (
                <View style={styles.inlineBanner}>
                  <Ionicons color={theme.secondary} name="warning-outline" size={18} />
                  <Text style={styles.inlineBannerText}>{setupMessage}</Text>
                </View>
              ) : null}

              {activeTab === 'dashboard' ? (
                <View style={styles.sectionGap}>
                  <BentoCard tone="highlight">
                    <Text style={styles.kicker}>Dashboard</Text>
                    <Text style={styles.heroTitle}>{rs(monthlySpend)} spent this month</Text>
                    <Text style={styles.bodyMuted}>Keep your family budget clear, shared, and calm.</Text>
                  </BentoCard>

                  <View style={[styles.bentoRow, isTablet && { justifyContent: 'space-between' }]}> 
                    <BentoCard style={{ width: bentoWidth }}>
                      <Text style={styles.cardEyebrow}>Active budget</Text>
                      <Text style={styles.cardTitle}>{activeBudget?.name ?? 'No plan yet'}</Text>
                      <Text style={styles.metricText}>{rs(activeBudgetSpent)}</Text>
                      <Text style={styles.bodyMuted}>of {rs((activeBudget?.total_amount ?? 0) + (activeBudget ? (contributionsByPlan[activeBudget.id] ?? 0) : 0))} allocated</Text>
                      <View style={styles.spacer12} />
                      <ProgressBar progress={activeBudget ? activeBudgetSpent / Math.max(activeBudget.total_amount + (contributionsByPlan[activeBudget.id] ?? 0), 1) : 0} />
                    </BentoCard>

                    <BentoCard style={{ width: bentoWidth }}>
                      <Text style={styles.cardEyebrow}>Shopping</Text>
                      <Text style={styles.metricText}>{pendingItemsCount}</Text>
                      <Text style={styles.bodyMuted}>pending household items</Text>
                      <View style={styles.statRow}>
                        <InfoPill label="Bought" value={`${shoppingItems.filter((item) => item.is_bought).length}`} />
                        <InfoPill label="Unread" value={`${shoppingBadgeCount}`} />
                      </View>
                    </BentoCard>

                    <BentoCard style={{ width: bentoWidth }}>
                      <Text style={styles.cardEyebrow}>Members</Text>
                      <Text style={styles.metricText}>{members.length}</Text>
                      <Text style={styles.bodyMuted}>everyone sees updates in real time</Text>
                    </BentoCard>

                    <BentoCard style={{ width: bentoWidth }}>
                      <Text style={styles.cardEyebrow}>Notifications</Text>
                      <Text style={styles.metricText}>{unreadCount}</Text>
                      <Text style={styles.bodyMuted}>unread family updates</Text>
                    </BentoCard>
                  </View>

                  <BentoCard>
                    <View style={styles.rowBetween}>
                      <Text style={styles.sectionTitle}>Recent activity</Text>
                      <Pressable onPress={() => setShowNotifications(true)}>
                        <Text style={styles.linkText}>Open all</Text>
                      </Pressable>
                    </View>
                    {latestActivities.length > 0 ? (
                      latestActivities.map((item) => (
                        <View key={item.id} style={styles.listRow}>
                          <Ionicons color={theme.primary} name="ellipse" size={10} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.listTitle}>{item.message}</Text>
                            <Text style={styles.listSubtitle}>{formatShortDate(item.created_at)}</Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <EmptyState body="Notifications and shared actions will show here." title="No activity yet" />
                    )}
                  </BentoCard>
                </View>
              ) : null}

              {activeTab === 'budget' ? (
                <View style={styles.sectionGap}>
                  <View style={styles.headerBlock}>
                    <View style={styles.headerContent}>
                      <Text style={styles.sectionTitle}>Budget plans</Text>
                      <Text style={styles.bodyMuted}>Track spend, remaining balance, and shared expenses.</Text>
                    </View>
                    <View style={styles.iconRow}>
                      <Pressable hitSlop={8} onPress={() => setBudgetEditMode(!budgetEditMode)} testID="budget-edit-mode-toggle">
                        <Ionicons color={budgetEditMode ? theme.primary : theme.textMuted} name={budgetEditMode ? 'checkmark-circle' : 'settings-outline'} size={24} />
                      </Pressable>
                      <ModernButton onPress={() => { setEditingPlanId(null); setBudgetForm(defaultBudgetForm()); setShowBudgetComposer(true); }} secondary testID="budget-new-plan" text="New plan" />
                    </View>
                  </View>

                  {plans.map((plan) => {
                    const spent = (spentByPlan[plan.id] ?? 0) + (contributionsByPlan[plan.id] ?? 0) + (borrowedByPlan[plan.id] ?? 0) - (repaidByPlan[plan.id] ?? 0);
                    const allocated = plan.total_amount + (contributionsByPlan[plan.id] ?? 0);
                    const remaining = Math.max(allocated - spent, 0);
                    return (
                      <BentoCard key={plan.id} style={styles.planCard}>
                        <View style={styles.rowBetween}>
                          <Pressable 
                            onPress={() => setSelectedPlanId(plan.id)} 
                            style={{ flex: 1 }} 
                            testID={`budget-plan-${plan.id}`}
                          >
                            <Text style={styles.cardTitle}>{plan.name}</Text>
                            <Text style={styles.bodyMuted}>
                              {formatShortDate(plan.start_date)} → {formatShortDate(plan.end_date)}
                            </Text>
                          </Pressable>
                          <View style={styles.iconRow}>
                            {budgetEditMode ? (
                              <>
                                <Pressable hitSlop={8} onPress={() => handleEditBudget(plan)} testID={`budget-edit-${plan.id}`}>
                                  <Ionicons color={theme.primary} name="create-outline" size={22} />
                                </Pressable>
                                <Pressable hitSlop={8} onPress={() => handleDeleteBudget(plan.id, plan.name)} testID={`budget-delete-${plan.id}`}>
                                  <Ionicons color={theme.danger} name="trash-outline" size={22} />
                                </Pressable>
                              </>
                            ) : null}
                            <Pressable hitSlop={8} onPress={() => setSelectedPlanId(plan.id)}>
                              <Ionicons color={theme.primary} name="chevron-forward-circle-outline" size={26} />
                            </Pressable>
                          </View>
                        </View>
                        <View style={styles.statRow}>
                          <InfoPill label="Allocated" value={rs(allocated)} />
                          <InfoPill label="Spent" value={rs(spent)} />
                          <InfoPill label="Left" value={rs(remaining)} />
                        </View>
                        <ProgressBar progress={spent / Math.max(allocated, 1)} />
                      </BentoCard>
                    );
                  })}

                  {plans.length === 0 ? (
                    <EmptyState body="Create your first family budget plan to start tracking expenses." title="No plans yet" />
                  ) : null}
                </View>
              ) : null}

              {activeTab === 'shopping' ? (
                <View style={styles.sectionGap}>
                  <View style={styles.headerBlock}>
                    <View style={styles.headerContent}>
                      <Text style={styles.sectionTitle}>Shopping list</Text>
                      <Text style={styles.bodyMuted}>Shared in real time with bought timestamps and member names.</Text>
                    </View>
                    <ModernButton onPress={() => setShowShoppingComposer(true)} secondary testID="shopping-open-add" text="Add item" />
                  </View>

                  <View style={styles.segmentRow}>
                    {shoppingFilters.map((filter) => (
                      <CategoryChip key={filter} active={shoppingFilter === filter} label={filter} onPress={() => setShoppingFilter(filter)} />
                    ))}
                  </View>

                  <Pressable hitSlop={10} onPress={() => runAction(async () => activeProfile && shoppingApi.clearBought(activeProfile.id).then(() => refreshProfileData(activeProfile.id)))}>
                    <Text style={styles.linkText}>Clear all bought items</Text>
                  </Pressable>

{filteredShoppingItems.length > 0 ? (
                    filteredShoppingItems.map((item) => {
                      const actor = memberMap.get(item.bought_by ?? item.added_by);
                      const renderRightActions = () => (
                        <View style={styles.deleteAction}>
                          <Pressable
                            hitSlop={10}
                            onPress={() => handleDeleteShoppingItem(item.id, item.name)}
                            style={styles.deleteButton}
                            testID={`shopping-delete-${item.id}`}
                          >
                            <Ionicons color="#fff" name="trash-outline" size={24} />
                          </Pressable>
                        </View>
                      );
                      return (
                        <Swipeable key={item.id} renderRightActions={renderRightActions} overshootRight={false}>
                          <BentoCard style={styles.shoppingCard}>
                            <View style={styles.rowBetween}>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.listTitle, item.is_bought && styles.strikethrough]}>{item.name}</Text>
                                <Text style={styles.listSubtitle}>
                                  {item.quantity ? `${item.quantity} • ` : ''}
                                  {item.category || 'General'}
                                </Text>
                                <Text style={styles.listSubtitle}>
                                  Added by {memberMap.get(item.added_by)?.name ?? 'Member'}
                                  {item.is_bought ? ` • Bought by ${actor?.name ?? 'Member'} on ${formatShortDate(item.bought_at)}` : ''}
                                </Text>
                              </View>
                              <Pressable hitSlop={12} onPress={() => handleMarkBought(item)} testID={`shopping-mark-bought-${item.id}`}>
                                <Ionicons
                                  color={item.is_bought ? theme.success : theme.primary}
                                  name={item.is_bought ? 'checkmark-circle' : 'checkmark-circle-outline'}
                                  size={28}
                                />
                              </Pressable>
                            </View>
                          </BentoCard>
                        </Swipeable>
                      );
                    })
                  ) : (
                    <EmptyState body="Add household items so everyone can see and update them together." title="List is empty" />
                  )}
                </View>
              ) : null}

              {activeTab === 'profile' ? (
                <View style={styles.sectionGap}>
                  <BentoCard tone="highlight">
                    <Text style={styles.sectionTitle}>{userProfile.name}</Text>
                    <Text style={styles.bodyMuted}>{userProfile.email}</Text>
                    <View style={styles.statRow}>
                      <InfoPill label="Avatar" value={userProfile.avatar_emoji ?? '🏡'} />
                      <InfoPill label="Home" value={activeProfile.name} />
                    </View>
                  </BentoCard>

                  <View style={styles.quickActionGrid}>
                    <QuickActionCard icon="people-outline" label="Members" onPress={() => setShowMembers(true)} testID="profile-open-members" />
                    <QuickActionCard icon="person-add-outline" label="Invite" onPress={() => setShowInvite(true)} testID="profile-open-invite" />
                    <QuickActionCard icon="settings-outline" label="Settings" onPress={primeSettingsForm} testID="profile-open-settings" />
                    <QuickActionCard icon="swap-horizontal-outline" label="Switch" onPress={() => setShowProfileSwitcher(true)} testID="profile-open-switcher" />
                  </View>

                  <BentoCard>
                    <View style={styles.reminderSection}>
                      <Text style={styles.inputLabel}>Daily Reminder</Text>
                      <View style={styles.reminderRow}>
                        <View style={styles.reminderInfo}>
                          <Ionicons color={theme.primary} name="notifications-outline" size={24} />
                          <View style={styles.reminderTextWrap}>
                            <Text style={styles.reminderText}>Remind me to add expenses</Text>
                            <Text style={styles.reminderSubtext}>Daily notification at {reminderTime}</Text>
                          </View>
                        </View>
                        <Pressable 
                          hitSlop={10} 
                          onPress={() => toggleReminder(!reminderEnabled)}
                          style={[styles.toggleButton, reminderEnabled && styles.toggleButtonActive]}
                        >
                          <View style={[styles.toggleCircle, reminderEnabled && styles.toggleCircleActive]} />
                        </Pressable>
                      </View>
                      
                      {reminderEnabled ? (
                        <View style={styles.timePickerRow}>
                          <Text style={styles.inputLabel}>Reminder time</Text>
                          <TextInput
                            keyboardType="numeric"
                            onChangeText={(value) => updateReminderTime(value)}
                            placeholder="20:00"
                            style={styles.timeInput}
                            value={reminderTime}
                          />
                          <Text style={styles.timeHint}>Format: HH:MM (24-hour)</Text>
                        </View>
                      ) : null}
                    </View>
                  </BentoCard>
                </View>
              ) : null}
            </ScrollView>
          )}

          <View style={styles.bottomTabs}>
            <TabButton active={activeTab === 'dashboard'} badge={0} icon="grid-outline" label="Dashboard" onPress={() => setActiveTab('dashboard')} testID="tab-dashboard" />
            <TabButton active={activeTab === 'budget'} badge={0} icon="wallet-outline" label="Budget" onPress={() => setActiveTab('budget')} testID="tab-budget" />
            <TabButton active={activeTab === 'shopping'} badge={shoppingBadgeCount} icon="cart-outline" label="Shopping" onPress={() => setActiveTab('shopping')} testID="tab-shopping" />
            <TabButton active={activeTab === 'profile'} badge={0} icon="person-outline" label="Profile" onPress={() => setActiveTab('profile')} testID="tab-profile" />
          </View>
        </View>
      </KeyboardAvoidingView>

      <ConfirmModal
        body={confirmModal?.body ?? ''}
        confirmText={confirmModal?.confirmText ?? 'Confirm'}
        destructive={confirmModal?.destructive ?? false}
        onConfirm={() => {
          confirmModal?.onConfirm();
          closeConfirm();
        }}
        onClose={closeConfirm}
        title={confirmModal?.title ?? ''}
        visible={confirmModal?.visible ?? false}
      />

      <Modal animationType="slide" presentationStyle="pageSheet" visible={showBudgetComposer}>
        <ModalScaffold
          closeTestID="close-budget-modal"
          onClose={() => {
            setShowBudgetComposer(false);
            setEditingPlanId(null);
            setBudgetForm(defaultBudgetForm());
          }}
          title={editingPlanId ? 'Edit Budget Plan' : 'Create Budget Plan'}
        >
          <LabeledInput label="Plan name" onChangeText={(value) => setBudgetForm((current) => ({ ...current, name: value }))} testID="budget-plan-name-input" value={budgetForm.name} />
          <LabeledInput keyboardType="numeric" label="Total budget (Rs.)" onChangeText={(value) => setBudgetForm((current) => ({ ...current, totalAmount: value }))} testID="budget-plan-total-input" value={budgetForm.totalAmount} />
          <LabeledInput label="Start date (YYYY-MM-DD)" onChangeText={(value) => setBudgetForm((current) => ({ ...current, startDate: value }))} testID="budget-plan-start-input" value={budgetForm.startDate} />
          <LabeledInput label="End date (YYYY-MM-DD)" onChangeText={(value) => setBudgetForm((current) => ({ ...current, endDate: value }))} testID="budget-plan-end-input" value={budgetForm.endDate} />
          <ModernButton loading={actionBusy} onPress={handleCreateBudget} testID="budget-save-plan" text={editingPlanId ? 'Update plan' : 'Save plan'} />
        </ModalScaffold>
      </Modal>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={Boolean(selectedPlan)}>
        <ModalScaffold closeTestID="close-budget-detail-modal" onClose={() => setSelectedPlanId(null)} title={selectedPlan?.name ?? 'Budget plan'}>
          {selectedPlan ? (
            <>
              <View style={styles.monthSelectorWrap}>
                <View style={styles.yearNavRow}>
                  <Pressable
                    hitSlop={10}
                    onPress={() => {
                      const idx = availableViewYears.indexOf(activeViewYear);
                      if (idx > 0) setActiveViewYear(availableViewYears[idx - 1]);
                    }}
                    style={[styles.yearNavArrow, availableViewYears.indexOf(activeViewYear) <= 0 && styles.yearNavArrowDisabled]}
                  >
                    <Ionicons color={availableViewYears.indexOf(activeViewYear) <= 0 ? theme.border : theme.primary} name="chevron-back-outline" size={20} />
                  </Pressable>
                  <Text style={styles.yearNavText}>{activeViewYear}</Text>
                  <Pressable
                    hitSlop={10}
                    onPress={() => {
                      const idx = availableViewYears.indexOf(activeViewYear);
                      if (idx < availableViewYears.length - 1) setActiveViewYear(availableViewYears[idx + 1]);
                    }}
                    style={[styles.yearNavArrow, availableViewYears.indexOf(activeViewYear) >= availableViewYears.length - 1 && styles.yearNavArrowDisabled]}
                  >
                    <Ionicons color={availableViewYears.indexOf(activeViewYear) >= availableViewYears.length - 1 ? theme.border : theme.primary} name="chevron-forward-outline" size={20} />
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScrollRow}>
                  <CategoryChip
                    active={activeViewMonth === 'current'}
                    label="Current"
                    onPress={() => setActiveViewMonth('current')}
                  />
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
                    const hasData = availableViewMonths.includes(m);
                    if (!hasData && !(activeViewYear === new Date().getFullYear() && m === new Date().getMonth() + 1)) return null;
                    return (
                      <CategoryChip
                        key={m}
                        active={activeViewMonth === m}
                        label={monthShort[m - 1]}
                        onPress={() => setActiveViewMonth(m)}
                      />
                    );
                  })}
                </ScrollView>
              </View>

              {isViewingArchive && monthFilteredExpenses ? (
                <>
                  <View style={styles.archiveBadge}>
                    <Text style={styles.archiveBadgeText}>
                      Viewing {monthNames[(activeViewMonth as number) - 1]} {activeViewYear}
                    </Text>
                  </View>

                  {(() => {
                    const mExpenses = monthFilteredExpenses.filter((e) => !e.is_borrow);
                    const mSpent = mExpenses.filter((e) => !e.paid_by).reduce((s, e) => s + Number(e.price ?? 0), 0);
                    const mContributions = mExpenses.filter((e) => e.paid_by).reduce((s, e) => s + Number(e.price ?? 0), 0);
                    const mBorrowed = monthFilteredExpenses.filter((e) => e.is_borrow && e.price > 0).reduce((s, e) => s + Number(e.price ?? 0), 0);
                    const mRepaid = monthFilteredExpenses.filter((e) => e.is_borrow && e.price < 0).reduce((s, e) => s + Math.abs(Number(e.price ?? 0)), 0);
                    const mTotalSpent = mSpent + mContributions + mBorrowed - mRepaid;
                    const mAllocated = selectedPlan.total_amount + mContributions;
                    const mRemaining = Math.max(mAllocated - mTotalSpent, 0);

                    const mMemberBalances: Record<string, { avatar: string; borrowed: number; contributed: number; name: string; owes: number; repaid: number }> = {};
                    monthFilteredExpenses.forEach((e) => {
                      if (!e.is_borrow) return;
                      const userId = e.used_by ?? e.added_by;
                      const member = memberMap.get(userId);
                      if (!member) return;
                      if (!mMemberBalances[userId]) mMemberBalances[userId] = { ...member, borrowed: 0, contributed: 0, owes: 0, repaid: 0 };
                      if (e.price > 0) mMemberBalances[userId].borrowed += e.price;
                      else mMemberBalances[userId].repaid += Math.abs(e.price);
                    });
                    mExpenses.filter((e) => e.paid_by).forEach((e) => {
                      const member = memberMap.get(e.paid_by!);
                      if (!member) return;
                      if (!mMemberBalances[e.paid_by!]) mMemberBalances[e.paid_by!] = { ...member, borrowed: 0, contributed: 0, owes: 0, repaid: 0 };
                      mMemberBalances[e.paid_by!].contributed += Number(e.price ?? 0);
                    });
                    Object.values(mMemberBalances).forEach((bal) => {
                      bal.owes = Math.max(bal.borrowed - bal.repaid - bal.contributed, 0);
                    });

                    return (
                      <>
                        <BentoCard tone="highlight">
                          <Text style={styles.metricText}>{rs(mTotalSpent)}</Text>
                          <Text style={styles.bodyMuted}>total spent out of {rs(mAllocated)} allocated</Text>
                          <View style={styles.spacer12} />
                          <ProgressBar progress={mTotalSpent / Math.max(mAllocated, 1)} />
                        </BentoCard>

                        <View style={styles.sectionGap}>
                          <Text style={styles.inputLabel}>Spending Breakdown</Text>
                          <View style={styles.statRow}>
                            <InfoPill label="Plan Budget" value={rs(selectedPlan.total_amount)} />
                            {mContributions > 0 ? (
                              <InfoPill label="+ Contributions" value={rs(mContributions)} />
                            ) : null}
                            <InfoPill label="= Allocated" value={rs(mAllocated)} />
                            <InfoPill label="- Family expenses" value={rs(mSpent)} />
                            {mContributions > 0 ? (
                              <InfoPill label="- Own-pocket spent" value={rs(mContributions)} />
                            ) : null}
                            {mBorrowed > 0 ? (
                              <InfoPill label="- Borrowed" value={rs(mBorrowed)} />
                            ) : null}
                            {mRepaid > 0 ? (
                              <InfoPill label="+ Repaid" value={rs(mRepaid)} />
                            ) : null}
                            <InfoPill label="= Remaining" value={rs(mRemaining)} />
                          </View>
                          {Object.keys(mMemberBalances).length > 0 ? (
                            <View style={styles.statRow}>
                              {Object.values(mMemberBalances).map((bal) => (
                                <InfoPill
                                  key={bal.name}
                                  label={`${bal.avatar} ${bal.name}`}
                                  value={bal.owes > 0 ? `Owes ${rs(bal.owes)}` : `Credit ${rs(bal.contributed - bal.borrowed + bal.repaid)}`}
                                />
                              ))}
                            </View>
                          ) : null}
                        </View>

                        {mExpenses.length > 0 ? (
                          <View style={styles.sectionGap}>
                            <Text style={styles.inputLabel}>Expenses</Text>
                            {mExpenses.map((expense) => {
                              const items = expense.items ?? [];
                              return (
                                <BentoCard key={expense.id}>
                                  <View style={styles.expenseCardRow}>
                                    <View style={styles.expenseDetails}>
                                      {expense.description ? (
                                        <Text style={styles.expenseDescription}>{expense.description}</Text>
                                      ) : null}
                                      {items.length > 0 ? (
                                        <View style={styles.itemsList}>
                                          {items.map((item, idx) => (
                                            <View key={idx} style={styles.itemRow}>
                                              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                                              <Text style={styles.itemPrice}>{rs(item.price)}</Text>
                                            </View>
                                          ))}
                                        </View>
                                      ) : null}
                                      <Text style={styles.listSubtitle}>
                                        {expense.category} • {formatShortDate(expense.date)}
                                      </Text>
                                      <Text style={styles.listSubtitle}>
                                        {expense.paid_by ? `Paid by ${memberMap.get(expense.paid_by)?.name ?? 'Member'}` : 'Paid from Family Budget'}
                                        {expense.used_by ? ` · Used by ${memberMap.get(expense.used_by)?.name ?? 'Member'}` : ''}
                                      </Text>
                                    </View>
                                    <View style={styles.expenseActions}>
                                      {items.length > 1 ? (
                                        <Text style={styles.totalAmount}>{rs(expense.price)}</Text>
                                      ) : null}
                                    </View>
                                  </View>
                                </BentoCard>
                              );
                            })}
                          </View>
                        ) : (
                          <EmptyState body="No expenses were recorded in this period." title="No expenses" />
                        )}

                        {(() => {
                          const archiveBorrows = monthFilteredExpenses.filter((e) => e.is_borrow);
                          if (archiveBorrows.length === 0) return null;
                          const borrowsByMember: Record<string, { member: { name: string; avatar: string }; borrowed: number; contributed: number; repaid: number; records: ExpenseWithItems[] }> = {};
                          archiveBorrows.forEach((e) => {
                            const userId = e.used_by ?? e.added_by;
                            const member = memberMap.get(userId);
                            if (!member) return;
                            if (!borrowsByMember[userId]) borrowsByMember[userId] = { member, borrowed: 0, contributed: 0, repaid: 0, records: [] };
                            if (e.price > 0) borrowsByMember[userId].borrowed += e.price;
                            else borrowsByMember[userId].repaid += Math.abs(e.price);
                            borrowsByMember[userId].records.push(e);
                          });
                          return (
                            <View style={styles.sectionGap}>
                              <Text style={styles.inputLabel}>Borrowed from Budget</Text>
                              {Object.entries(borrowsByMember).map(([userId, data]) => (
                                <BentoCard key={userId}>
                                  <View style={styles.borrowHeaderRow}>
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                      <Text style={styles.listTitle}>{`${data.member.avatar} ${data.member.name}`}</Text>
                                      <Text style={styles.listSubtitle}>{`Borrowed ${rs(data.borrowed)} · Repaid ${rs(data.repaid)} · Owes ${rs(Math.max(data.borrowed - data.repaid - data.contributed, 0))}`}</Text>
                                    </View>
                                  </View>
                                  {data.records.map((record) => (
                                    <View key={record.id} style={styles.borrowRecordRow}>
                                      <View style={{ flex: 1 }}>
                                        <Text style={styles.listSubtitle}>{`${record.price > 0 ? 'Borrowed' : 'Repaid'} ${rs(Math.abs(record.price))} · ${formatShortDate(record.date)}${record.description ? ` · ${record.description}` : ''}`}</Text>
                                      </View>
                                    </View>
                                  ))}
                                </BentoCard>
                              ))}
                            </View>
                          );
                        })()}
                      </>
                    );
                  })()}
                </>
              ) : (
                <>
                  <BentoCard tone="highlight">
                    <Text style={styles.metricText}>{rs((spentByPlan[selectedPlan.id] ?? 0) + (contributionsByPlan[selectedPlan.id] ?? 0) + (borrowedByPlan[selectedPlan.id] ?? 0) - (repaidByPlan[selectedPlan.id] ?? 0))}</Text>
                    <Text style={styles.bodyMuted}>total spent out of {rs(selectedPlan.total_amount + (contributionsByPlan[selectedPlan.id] ?? 0))} allocated</Text>
                    <View style={styles.spacer12} />
                    <ProgressBar progress={((spentByPlan[selectedPlan.id] ?? 0) + (contributionsByPlan[selectedPlan.id] ?? 0) + (borrowedByPlan[selectedPlan.id] ?? 0) - (repaidByPlan[selectedPlan.id] ?? 0)) / Math.max(selectedPlan.total_amount + (contributionsByPlan[selectedPlan.id] ?? 0), 1)} />
                  </BentoCard>

                  <View style={styles.sectionGap}>
                    <Text style={styles.inputLabel}>Spending Breakdown</Text>
                    <View style={styles.statRow}>
                      <InfoPill label="Plan Budget" value={rs(selectedPlan.total_amount)} />
                      {((contributionsByPlan[selectedPlan.id] ?? 0) > 0) ? (
                        <InfoPill label="+ Contributions" value={rs(contributionsByPlan[selectedPlan.id] ?? 0)} />
                      ) : null}
                      <InfoPill label="= Allocated" value={rs(selectedPlan.total_amount + (contributionsByPlan[selectedPlan.id] ?? 0))} />
                      <InfoPill label="- Family expenses" value={rs(spentByPlan[selectedPlan.id] ?? 0)} />
                      {((contributionsByPlan[selectedPlan.id] ?? 0) > 0) ? (
                        <InfoPill label="- Own-pocket spent" value={rs(contributionsByPlan[selectedPlan.id] ?? 0)} />
                      ) : null}
                      {((borrowedByPlan[selectedPlan.id] ?? 0) > 0) ? (
                        <InfoPill label="- Borrowed" value={rs(borrowedByPlan[selectedPlan.id] ?? 0)} />
                      ) : null}
                      {((repaidByPlan[selectedPlan.id] ?? 0) > 0) ? (
                        <InfoPill label="+ Repaid" value={rs(repaidByPlan[selectedPlan.id] ?? 0)} />
                      ) : null}
                      <InfoPill label="= Remaining" value={rs(Math.max((selectedPlan.total_amount + (contributionsByPlan[selectedPlan.id] ?? 0)) - (spentByPlan[selectedPlan.id] ?? 0) - (contributionsByPlan[selectedPlan.id] ?? 0) - (borrowedByPlan[selectedPlan.id] ?? 0) + (repaidByPlan[selectedPlan.id] ?? 0), 0))} />
                    </View>
                    {Object.keys(memberBorrowBalances).length > 0 ? (
                      <View style={styles.statRow}>
                        {Object.values(memberBorrowBalances).map((bal) => (
                          <InfoPill
                            key={bal.member.name}
                            label={`${bal.member.avatar} ${bal.member.name}`}
                            value={bal.owes > 0 ? `Owes ${rs(bal.owes)}` : `Credit ${rs(bal.contributed - bal.borrowed + bal.repaid)}`}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.rowBetween}>
                    <View style={styles.segmentRow}>
                      {expenseFilters.map((filter) => (
                        <CategoryChip key={filter} active={expenseView === filter} label={filter} onPress={() => setExpenseView(filter)} />
                      ))}
                    </View>
                    <Pressable hitSlop={10} onPress={() => setShowExpenseFilters(true)}>
                      <Ionicons color={theme.primary} name="options-outline" size={24} />
                    </Pressable>
                  </View>

                  <View style={styles.dualActions}>
                    <ModernButton
                      icon={<Ionicons color="#FFFFFF" name="add" size={18} />}
                      onPress={() => setShowExpenseComposer(true)}
                      testID="open-add-expense"
                      text="Add expense"
                    />
                    <ModernButton
                      icon={<Ionicons color="#FFFFFF" name="cash-outline" size={18} />}
                      onPress={() => setShowBorrowComposer(true)}
                      secondary
                      testID="open-borrow"
                      text="Borrow"
                    />
                  </View>

                  {filteredExpenses.length > 0 ? (
                    filteredExpenses.map((expense) => {
                      const items = expense.items ?? [];
                      const expenseTitle = items.length > 0 
                        ? items.map(i => i.name).join(', ')
                        : expense.description || 'Expense';
                      const hasMultipleItems = items.length > 1;
                      
                      return (
                        <BentoCard key={expense.id}>
                          <View style={styles.expenseCardRow}>
                            <View style={styles.expenseDetails}>
                              {expense.description ? (
                                <Text style={styles.expenseDescription}>{expense.description}</Text>
                              ) : null}
                              {items.length > 0 ? (
                                <View style={styles.itemsList}>
                                  {items.map((item, idx) => (
                                    <View key={idx} style={styles.itemRow}>
                                      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                                      <Text style={styles.itemPrice}>{rs(item.price)}</Text>
                                    </View>
                                  ))}
                                </View>
                              ) : null}
                              <Text style={styles.listSubtitle}>
                                {expense.category} • {formatShortDate(expense.date)}
                              </Text>
                              <Text style={styles.listSubtitle}>
                                {expense.paid_by ? `Paid by ${memberMap.get(expense.paid_by)?.name ?? 'Member'}` : 'Paid from Family Budget'}
                                {expense.used_by ? ` · Used by ${memberMap.get(expense.used_by)?.name ?? 'Member'}` : ''}
                              </Text>
                            </View>
                            
                            <View style={styles.expenseActions}>
                              {hasMultipleItems ? (
                                <Text style={styles.totalAmount}>{rs(expense.price)}</Text>
                              ) : null}
                              <View style={styles.actionButtons}>
                                <Pressable hitSlop={10} onPress={() => startEditExpense(expense)} style={styles.editButton}>
                                  <Ionicons color={theme.primary} name="pencil" size={18} />
                                </Pressable>
                                <Pressable hitSlop={10} onPress={() => handleDeleteExpense(expense.id, expenseTitle)} style={styles.editButton}>
                                  <Ionicons color={theme.danger} name="trash" size={18} />
                                </Pressable>
                              </View>
                            </View>
                          </View>
                        </BentoCard>
                      );
                    })
                  ) : (
                    <EmptyState body="Use the add button to capture a new family expense." title="No expenses in this view" />
                  )}

                  {(() => {
                    const planBorrows = currentPlanExpenses.filter((e) => e.is_borrow && e.plan_id === selectedPlan.id);
                    if (planBorrows.length === 0) return null;
                    const borrowsByMember: Record<string, { member: { name: string; avatar: string }; borrowed: number; contributed: number; repaid: number; records: ExpenseWithItems[] }> = {};
                    planBorrows.forEach((e) => {
                      const userId = e.used_by ?? e.added_by;
                      const member = memberMap.get(userId);
                      if (!member) return;
                      if (!borrowsByMember[userId]) borrowsByMember[userId] = { member, borrowed: 0, contributed: 0, repaid: 0, records: [] };
                      if (e.price > 0) borrowsByMember[userId].borrowed += e.price;
                      else borrowsByMember[userId].repaid += Math.abs(e.price);
                      borrowsByMember[userId].records.push(e);
                    });
                    Object.entries(personalContributions).forEach(([userId, data]) => {
                      if (borrowsByMember[userId]) {
                        borrowsByMember[userId].contributed = data.total;
                      }
                    });
                    return (
                      <View style={styles.sectionGap}>
                        <Text style={styles.inputLabel}>Borrowed from Budget</Text>
                        {Object.entries(borrowsByMember).map(([userId, data]) => (
                          <BentoCard key={userId}>
                            <View style={styles.borrowHeaderRow}>
                              <View style={{ flex: 1, marginRight: 12 }}>
                                <Text style={styles.listTitle}>{`${data.member.avatar} ${data.member.name}`}</Text>
                                <Text style={styles.listSubtitle}>{`Borrowed ${rs(data.borrowed)} · Repaid ${rs(data.repaid)} · Owes ${rs(Math.max(data.borrowed - data.repaid - data.contributed, 0))}`}</Text>
                              </View>
                              <ModernButton
                                onPress={() => { setRepayForm({ amount: '', borrowId: userId, date: new Date().toISOString().slice(0, 10) }); setShowRepayComposer(true); }}
                                secondary
                                style={{ flexShrink: 0 }}
                                text="Repay"
                                testID={`repay-${userId}`}
                              />
                            </View>
                            {data.records.map((record) => (
                              <View key={record.id} style={styles.borrowRecordRow}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.listSubtitle}>{`${record.price > 0 ? 'Borrowed' : 'Repaid'} ${rs(Math.abs(record.price))} · ${formatShortDate(record.date)}${record.description ? ` · ${record.description}` : ''}`}</Text>
                                </View>
                                <View style={styles.actionButtons}>
                                  <Pressable hitSlop={10} onPress={() => startEditBorrow(record)} style={styles.editButton}>
                                    <Ionicons color={theme.primary} name="pencil" size={18} />
                                  </Pressable>
                                  <Pressable hitSlop={10} onPress={() => handleDeleteExpense(record.id, record.price > 0 ? 'Borrow' : 'Repayment')} style={styles.editButton}>
                                    <Ionicons color={theme.danger} name="trash" size={18} />
                                  </Pressable>
                                </View>
                              </View>
                            ))}
                          </BentoCard>
                        ))}
                      </View>
                    );
                  })()}
                </>
              )}
            </>
          ) : null}
          {!isViewingArchive && (
            <>
              <View style={styles.spacer16} />
              <ModernButton
                destructive
                onPress={() => selectedPlan && handleResetBudget(selectedPlan.id, selectedPlan.name)}
                testID="reset-budget-button"
                text="Reset Budget"
              />
            </>
          )}
        </ModalScaffold>
      </Modal>

      <Modal animationType="slide" transparent visible={showExpenseComposer}>
        <BottomSheet onClose={() => {
          setShowExpenseComposer(false);
          setEditingExpenseId(null);
          setExpenseForm(defaultExpenseForm());
        }}>
          <Text style={styles.sectionTitle}>{editingExpenseId ? 'Edit Expense' : 'Add Expense'}</Text>
          
          <View style={styles.fieldSection}>
            <View style={styles.rowBetween}>
              <Text style={styles.inputLabel}>Items</Text>
              <Text style={styles.totalText}>Total: {rs(expenseTotal)}</Text>
            </View>
            
            {expenseForm.items.map((item, index) => (
              <View key={index} style={styles.itemInputRow}>
                <TextInput
                  onChangeText={(value) => updateExpenseItem(index, 'name', value)}
                  placeholder="Item name"
                  style={[styles.textInput, styles.itemNameInput]}
                  value={item.name}
                />
                <TextInput
                  keyboardType="numeric"
                  onChangeText={(value) => updateExpenseItem(index, 'price', value)}
                  placeholder="Rs."
                  style={[styles.textInput, styles.itemPriceInput]}
                  value={item.price}
                />
                {expenseForm.items.length > 1 ? (
                  <Pressable hitSlop={10} onPress={() => removeExpenseItem(index)} style={styles.removeItemButton}>
                    <Ionicons color={theme.danger} name="close-circle" size={24} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            
            <Pressable hitSlop={10} onPress={addExpenseItem} style={styles.addItemButton}>
              <Ionicons color={theme.primary} name="add-circle-outline" size={20} />
              <Text style={styles.addItemText}>Add item</Text>
            </Pressable>
          </View>

          <View style={styles.fieldSection}>
            <Text style={styles.inputLabel}>Category</Text>
            <View style={styles.segmentRow}>
              {expenseCategories.map((category) => (
                <CategoryChip key={category.key} active={expenseForm.category === category.key} label={category.key} onPress={() => setExpenseForm((current) => ({ ...current, category: category.key }))} />
              ))}
            </View>
          </View>
          {expenseForm.category === 'Other' ? (
            <LabeledInput label="Custom category" onChangeText={(value) => setExpenseForm((current) => ({ ...current, customCategory: value }))} testID="expense-category-custom-input" value={expenseForm.customCategory} />
          ) : null}
          <View style={styles.fieldSection}>
            <Text style={styles.inputLabel}>Who paid?</Text>
            <View style={styles.segmentRow}>
              <CategoryChip
                active={expenseForm.paidBy === null}
                label="Family Budget"
                onPress={() => setExpenseForm((current) => ({ ...current, paidBy: null, usedBy: current.usedBy ?? session?.user?.id ?? null }))}
              />
              {members.map((member) => (
                <CategoryChip
                  key={member.user_id}
                  active={expenseForm.paidBy === member.user_id}
                  label={member.user_profile?.name ?? 'Member'}
                  onPress={() => setExpenseForm((current) => ({ ...current, paidBy: member.user_id, usedBy: null }))}
                />
              ))}
            </View>
          </View>
          {expenseForm.paidBy === null ? (
            <View style={styles.fieldSection}>
              <Text style={styles.inputLabel}>Who used it?</Text>
              <View style={styles.segmentRow}>
                <CategoryChip
                  active={expenseForm.usedBy === null}
                  label="Shared/Family"
                  onPress={() => setExpenseForm((current) => ({ ...current, usedBy: null }))}
                />
                {members.map((member) => (
                  <CategoryChip
                    key={member.user_id}
                    active={expenseForm.usedBy === member.user_id}
                    label={member.user_profile?.name ?? 'Member'}
                    onPress={() => setExpenseForm((current) => ({ ...current, usedBy: member.user_id }))}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <DatePickerField date={expenseForm.date} label="Date" onDateChange={(value) => setExpenseForm((current) => ({ ...current, date: value }))} testID="expense-date-input" />
          
          <LabeledInput 
            label="Description (optional)" 
            onChangeText={(value) => setExpenseForm((current) => ({ ...current, description: value }))} 
            testID="expense-description-input" 
            value={expenseForm.description} 
          />
          
          <View style={styles.spacer16} />
          <ModernButton loading={actionBusy} onPress={handleAddExpense} testID="expense-save-button" text={editingExpenseId ? 'Update expense' : 'Save expense'} />
        </BottomSheet>
      </Modal>

<Modal animationType="slide" transparent visible={showShoppingComposer}>
        <BottomSheet onClose={() => setShowShoppingComposer(false)}>
          <Text style={styles.sectionTitle}>Add Shopping Item</Text>
          <LabeledInput label="Product name" onChangeText={(value) => setShoppingForm((current) => ({ ...current, name: value }))} testID="shopping-name-input" value={shoppingForm.name} />
          <LabeledInput label="Quantity (optional)" onChangeText={(value) => setShoppingForm((current) => ({ ...current, quantity: value }))} testID="shoppong-quantity-input" value={shoppingForm.quantity} />
          <Text style={styles.inputLabel}>Category</Text>
          <View style={styles.segmentRow}>
            {shoppingCategories.map((category) => (
              <CategoryChip key={category} active={shoppingForm.category === category} label={category} onPress={() => setShoppingForm((current) => ({ ...current, category }))} />
            ))}
          </View>
          <View style={styles.spacer16} />
<ModernButton loading={actionBusy} onPress={handleAddShoppingItem} testID="shopping-save-button" text="Add item" />
        </BottomSheet>
      </Modal>

      <Modal animationType="slide" transparent visible={showBoughtComposer}>
        <BottomSheet onClose={() => { setShowBoughtComposer(false); setPendingBoughtItem(null); setBoughtForm({ price: '', paidBy: null, planId: '' }); }}>
          <Text style={styles.sectionTitle}>Mark as Bought</Text>
          {pendingBoughtItem ? (
            <>
              <Text style={styles.bodyMuted}>
                {pendingBoughtItem.name}
                {pendingBoughtItem.quantity ? ` (Qty: ${pendingBoughtItem.quantity})` : ''}
                {pendingBoughtItem.category ? ` • ${pendingBoughtItem.category}` : ''}
              </Text>
              <View style={styles.spacer12} />
              <LabeledInput keyboardType="numeric" label="Price (Rs.)" onChangeText={(value) => setBoughtForm((current) => ({ ...current, price: value }))} testID="bought-price-input" value={boughtForm.price} />
              <Text style={styles.inputLabel}>Who paid?</Text>
              <View style={styles.segmentRow}>
                <CategoryChip active={boughtForm.paidBy === null} label="Family Budget" onPress={() => setBoughtForm((current) => ({ ...current, paidBy: null }))} />
                {members.map((member) => (
                  <CategoryChip key={member.id} active={boughtForm.paidBy === member.user_id} label={member.user_profile?.name ?? 'Member'} onPress={() => setBoughtForm((current) => ({ ...current, paidBy: member.user_id }))} />
                ))}
              </View>
              <Text style={styles.inputLabel}>Budget plan</Text>
              <View style={styles.segmentRow}>
                {plans.map((plan) => (
                  <CategoryChip key={plan.id} active={boughtForm.planId === plan.id} label={plan.name} onPress={() => setBoughtForm((current) => ({ ...current, planId: plan.id }))} />
                ))}
              </View>
              <View style={styles.spacer16} />
              <ModernButton loading={actionBusy} onPress={handleConfirmBought} testID="confirm-bought-button" text="Confirm & Add to Budget" />
            </>
          ) : null}
        </BottomSheet>
      </Modal>

<Modal animationType="slide" transparent visible={showBorrowComposer}>
        <BottomSheet onClose={() => { setShowBorrowComposer(false); setBorrowForm({ amount: '', date: new Date().toISOString().slice(0, 10), description: '' }); setEditingBorrowId(null); }}>
          <Text style={styles.sectionTitle}>{editingBorrowId ? 'Edit Borrow' : 'Borrow from Budget'}</Text>
          <LabeledInput keyboardType="numeric" label="Amount (Rs.)" onChangeText={(value) => setBorrowForm((current) => ({ ...current, amount: value }))} testID="borrow-amount-input" value={borrowForm.amount} />
          <DatePickerField date={borrowForm.date} label="Date" onDateChange={(value) => setBorrowForm((current) => ({ ...current, date: value }))} testID="borrow-date-input" />
          <LabeledInput label="Description (optional)" onChangeText={(value) => setBorrowForm((current) => ({ ...current, description: value }))} testID="borrow-description-input" value={borrowForm.description} />
          <View style={styles.spacer16} />
          <ModernButton loading={actionBusy} onPress={handleBorrow} testID="borrow-save-button" text={editingBorrowId ? 'Update' : 'Borrow'} />
        </BottomSheet>
      </Modal>

      <Modal animationType="slide" transparent visible={showRepayComposer}>
        <BottomSheet onClose={() => { setShowRepayComposer(false); setRepayForm({ amount: '', borrowId: '', date: new Date().toISOString().slice(0, 10) }); }}>
          <Text style={styles.sectionTitle}>Repay to Budget</Text>
          <LabeledInput keyboardType="numeric" label="Amount (Rs.)" onChangeText={(value) => setRepayForm((current) => ({ ...current, amount: value }))} testID="repay-amount-input" value={repayForm.amount} />
          <DatePickerField date={repayForm.date} label="Date" onDateChange={(value) => setRepayForm((current) => ({ ...current, date: value }))} testID="repay-date-input" />
          <View style={styles.spacer16} />
          <ModernButton loading={actionBusy} onPress={handleRepay} testID="repay-save-button" text="Repay" />
        </BottomSheet>
      </Modal>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={showMembers}>
        <ModalScaffold closeTestID="close-members-modal" onClose={() => setShowMembers(false)} title="Members">
          {members.map((member) => (
            <BentoCard key={member.id}>
              <View style={styles.rowBetween}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>{member.user_profile?.avatar_emoji ?? '🏡'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{member.user_profile?.name ?? 'Member'}</Text>
                  <Text style={styles.listSubtitle}>{member.user_profile?.email ?? '—'}</Text>
                  <Text style={styles.listSubtitle}>Joined {formatShortDate(member.joined_at)}</Text>
                </View>
              </View>
            </BentoCard>
          ))}
        </ModalScaffold>
      </Modal>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={showInvite}>
        <ModalScaffold closeTestID="close-invite-modal" onClose={() => setShowInvite(false)} title="Invite Member">
          <Text style={styles.bodyMuted}>Send an email invite or share the generated link. The invite opens NestLedger and joins the selected profile.</Text>
          <LabeledInput label="Invitee email" onChangeText={setInviteEmail} testID="invite-email-input" value={inviteEmail} />
          <ModernButton loading={actionBusy} onPress={handleSendInvite} testID="invite-send-email" text="Send invite email" />
          {lastInviteLink ? (
            <BentoCard>
              <Text style={styles.cardTitle}>Shareable invite link</Text>
              <Text style={styles.linkBlock}>{lastInviteLink}</Text>
              <View style={styles.dualActions}>
                <ModernButton
                  onPress={() => Clipboard.setStringAsync(lastInviteLink).then(() => announce('Invite link copied.'))}
                  secondary
                  testID="invite-copy-link"
                  text="Copy link"
                />
                <ModernButton onPress={() => Share.share({ message: lastInviteLink })} testID="invite-share-link" text="Share link" />
              </View>
            </BentoCard>
          ) : null}
        </ModalScaffold>
      </Modal>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={showNotifications}>
        <ModalScaffold
          closeTestID="close-notifications-modal"
          onClose={() => setShowNotifications(false)}
          rightAction={
            <Pressable hitSlop={10} onPress={() => activeProfile && session?.user && notificationApi.markAllRead(activeProfile.id, session.user.id).then(() => refreshProfileData(activeProfile.id))} testID="notifications-mark-all-read">
              <Text style={styles.linkText}>Mark all read</Text>
            </Pressable>
          }
          title="Notifications"
        >
          {notifications.length > 0 ? (
            notifications.map((item) => (
              <Pressable key={item.id} onPress={() => notificationApi.markRead(item.id).then(() => activeProfile && refreshProfileData(activeProfile.id))} testID={`notification-item-${item.id}`}>
                <BentoCard tone={item.is_read ? 'default' : 'highlight'}>
                  <Text style={styles.listTitle}>{item.message}</Text>
                  <Text style={styles.listSubtitle}>{formatShortDate(item.created_at)}</Text>
                </BentoCard>
              </Pressable>
            ))
          ) : (
            <EmptyState body="Recent activity for this profile will show here." title="All caught up" />
          )}
        </ModalScaffold>
      </Modal>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={showProfileSettings}>
        <ModalScaffold closeTestID="close-settings-modal" onClose={() => setShowProfileSettings(false)} title="Profile Settings">
          <Text style={styles.inputLabel}>Your profile</Text>
          <ProfileFormFields form={profileForm} onChange={setProfileForm} userOnly />
          <LabeledInput label="Family profile name" onChangeText={(value) => setProfileForm((current) => ({ ...current, familyName: value }))} testID="settings-family-name-input" value={profileForm.familyName} />
          <Text style={styles.inputLabel}>Family avatar</Text>
          <AvatarPicker selected={profileForm.familyEmoji} onPick={(value) => setProfileForm((current) => ({ ...current, familyEmoji: value }))} />
          <ModernButton loading={actionBusy} onPress={handleSaveSettings} testID="settings-save-button" text="Save changes" />
          <ModernButton onPress={() => authApi.signOut()} secondary testID="settings-signout-button" text="Sign out" />
          <ModernButton destructive loading={activeProfile ? deletingProfileIds.has(activeProfile.id) : false} onPress={() => activeProfile && handleDeleteSpace(activeProfile.id)} secondary testID="settings-delete-button" text="Delete space" />
        </ModalScaffold>
      </Modal>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={showExpenseFilters}>
        <ModalScaffold closeTestID="close-expense-filters-modal" onClose={() => setShowExpenseFilters(false)} title="Filter Expenses">
          <Text style={styles.inputLabel}>Time window</Text>
          <View style={styles.segmentRow}>
            {expenseFilters.map((filter) => (
              <CategoryChip key={filter} active={expenseView === filter} label={filter} onPress={() => setExpenseView(filter)} />
            ))}
          </View>
          <Text style={styles.inputLabel}>Category search</Text>
          <View style={styles.segmentRow}>
            <CategoryChip active={expenseCategoryFilter === 'All'} label="All" onPress={() => setExpenseCategoryFilter('All')} />
            {expenseCategories.map((category) => (
              <CategoryChip key={category.key} active={expenseCategoryFilter === category.key} label={category.key} onPress={() => setExpenseCategoryFilter(category.key)} />
            ))}
          </View>
        </ModalScaffold>
      </Modal>
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function SplashScreen() {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
      <CenteredState body="Syncing your shared home space..." title="NestLedger" />
    </SafeAreaView>
  );
}

function CenteredState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.centerWrap}>
      <BentoCard tone="highlight" style={styles.centerCard}>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.bodyMuted}>{body}</Text>
      </BentoCard>
    </View>
  );
}

function EmptyState({ title, body }: { body: string; title: string }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.bodyMuted}>{body}</Text>
    </View>
  );
}

function LabeledInput({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput placeholderTextColor={theme.textMuted} style={styles.input} {...props} />
    </View>
  );
}

function DatePickerField({
  date,
  label,
  onDateChange,
  testID,
}: {
  date: string;
  label: string;
  onDateChange: (value: string) => void;
  testID?: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const dateObj = new Date(date);

  const formattedDate = dateObj.toLocaleDateString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const handleChange = (event: unknown, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) {
      const iso = selectedDate.toISOString().slice(0, 10);
      onDateChange(iso);
    }
  };

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Pressable onPress={() => setShowPicker(true)} style={styles.dateButton} testID={testID}>
        <Text style={styles.dateButtonText}>{formattedDate}</Text>
        <Ionicons color={theme.textMuted} name="calendar-outline" size={20} />
      </Pressable>
      {showPicker ? (
        <DateTimePicker
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          mode="date"
          onChange={handleChange}
          value={dateObj}
        />
      ) : null}
    </View>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoPill}>
      <Text style={styles.infoPillLabel}>{label}</Text>
      <Text style={styles.infoPillValue}>{value}</Text>
    </View>
  );
}

function TabButton({
  active,
  badge,
  icon,
  label,
  onPress,
  testID,
}: {
  active: boolean;
  badge: number;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable hitSlop={10} onPress={onPress} style={styles.tabButton} testID={testID}>
      <View>
        <Ionicons color={active ? theme.primary : theme.textMuted} name={icon} size={22} />
        {badge ? (
          <View style={[styles.badge, styles.tabBadge]}>
            <Text style={styles.badgeText}>{Math.min(badge, 9)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function QuickActionCard({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.quickActionCard} testID={testID}>
      <Ionicons color={theme.primary} name={icon} size={22} />
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

function ProfileFormFields({
  form,
  onChange,
  testIDPrefix,
  userOnly,
}: {
  form: CreateProfileForm;
  onChange: (value: CreateProfileForm) => void;
  testIDPrefix?: string;
  userOnly?: boolean;
}) {
  const prefix = testIDPrefix ?? (userOnly ? 'settings' : 'create-profile');

  return (
    <>
      <LabeledInput label="Your name" onChangeText={(value: string) => onChange({ ...form, name: value })} testID={`${prefix}-name-input`} value={form.name} />
      <Text style={styles.inputLabel}>Choose your avatar</Text>
      <AvatarPicker selected={form.avatarEmoji} testIDPrefix={`${prefix}-avatar`} onPick={(value) => onChange({ ...form, avatarEmoji: value })} />

      {!userOnly ? (
        <>
          <LabeledInput label="Family / home name" onChangeText={(value: string) => onChange({ ...form, familyName: value })} testID={`${prefix}-family-name-input`} value={form.familyName} />
          <Text style={styles.inputLabel}>Family avatar</Text>
          <AvatarPicker selected={form.familyEmoji} testIDPrefix={`${prefix}-family-avatar`} onPick={(value) => onChange({ ...form, familyEmoji: value })} />
        </>
      ) : null}
    </>
  );
}

function AvatarPicker({ onPick, selected, testIDPrefix }: { onPick: (value: string) => void; selected: string; testIDPrefix?: string }) {
  return (
    <View style={styles.avatarGrid}>
      {avatarChoices.map((choice) => (
        <Pressable key={choice} onPress={() => onPick(choice)} style={[styles.avatarChoice, selected === choice && styles.avatarChoiceActive]} testID={testIDPrefix ? `${testIDPrefix}-${choice}` : undefined}>
          <Text style={styles.avatarChoiceText}>{choice}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ConfirmModal({
  body,
  confirmText,
  destructive,
  onConfirm,
  onClose,
  title,
  visible,
}: {
  body: string;
  confirmText: string;
  destructive: boolean;
  onConfirm: () => void;
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.confirmBackdrop}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.confirmCard}>
          <View style={styles.confirmIconWrap}>
            <Ionicons color={destructive ? theme.danger : theme.warning} name={destructive ? 'trash-outline' : 'warning-outline'} size={32} />
          </View>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmBody}>{body}</Text>
          <View style={styles.confirmButtons}>
            <Pressable hitSlop={10} onPress={onClose} style={styles.confirmCancelButton}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable hitSlop={10} onPress={onConfirm} style={[styles.confirmButton, destructive && styles.confirmDestructive]}>
              <Text style={[styles.confirmButtonText, destructive && styles.confirmDestructiveText]}>{confirmText}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ModalScaffold({
  children,
  closeTestID,
  onClose,
  rightAction,
  title,
}: {
  children: ReactNode;
  closeTestID?: string;
  onClose: () => void;
  rightAction?: ReactNode;
  title: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={[styles.modalScreen, { paddingTop: insets.top }]}>
      <View style={styles.modalHeader}>
        <Pressable hitSlop={10} onPress={onClose} testID={closeTestID}>
          <Ionicons color={theme.text} name="close-outline" size={28} />
        </Pressable>
        <Text style={styles.modalTitle}>{title}</Text>
        <View>{rightAction}</View>
      </View>
      <ScrollView contentContainerStyle={styles.modalContent}>{children}</ScrollView>
    </SafeAreaView>
  );
}

function BottomSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <Pressable onPress={onClose} style={styles.sheetBackdrop}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.sheetCard}>
        <View style={styles.sheetGrabber} />
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <Pressable onPress={(event) => event.stopPropagation()}>
            {children}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  amountText: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  appShell: {
    backgroundColor: theme.background,
    flex: 1,
    paddingHorizontal: 20,
  },
  authCard: {
    gap: 14,
  },
  authWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  avatarChoice: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  avatarChoiceActive: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  avatarChoiceText: {
    fontSize: 24,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: theme.secondary,
    borderRadius: 999,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -8,
    top: -6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  bellButton: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  bentoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  bodyMuted: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  bottomTabs: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  cardEyebrow: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '700',
  },
  centerCard: {
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  centerWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  contentWrap: {
    gap: 18,
    paddingBottom: 40,
  },
  dualActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 26,
  },
  errorText: {
    color: theme.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  footnote: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  headerBlock: {
    gap: 14,
  },
  headerContent: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    color: theme.text,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
  infoPill: {
    backgroundColor: theme.surfaceMuted,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  infoPillLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  infoPillValue: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  inlineBanner: {
    alignItems: 'center',
    backgroundColor: theme.secondarySoft,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  inlineBannerText: {
    color: theme.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    color: theme.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  textInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 12,
    borderWidth: 1,
    color: theme.text,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  itemNameInput: {
    flex: 1,
  },
  itemPriceInput: {
    width: 100,
  },
  removeItemButton: {
    padding: 4,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  addItemText: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  totalText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  expenseCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  expenseDetails: {
    flex: 1,
    marginRight: 12,
  },
  expenseActions: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  totalAmount: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  expenseDescription: {
    color: theme.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  itemsList: {
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  itemName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  itemPrice: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '500',
  },
  inputGroup: {
    gap: 10,
  },
  fieldSection: {
    gap: 12,
    marginTop: 8,
  },
  inputLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
  },
  dateButton: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateButtonText: {
    color: theme.text,
    fontSize: 16,
  },
  kicker: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  linkBlock: {
    color: theme.text,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  linkText: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  listRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
  },
  listSubtitle: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  listTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  loaderWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  memberAvatar: {
    alignItems: 'center',
    backgroundColor: theme.primarySoft,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginRight: 12,
    width: 48,
  },
  memberAvatarText: {
    fontSize: 22,
  },
  metricText: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
  },
  modalContent: {
    gap: 14,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalScreen: {
    backgroundColor: theme.background,
    flex: 1,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmCard: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 24,
    width: '85%',
    maxWidth: 360,
    alignItems: 'center',
  },
  confirmIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.dangerSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmBody: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: theme.surfaceMuted,
    alignItems: 'center',
  },
  confirmCancelText: {
    color: theme.textMuted,
    fontSize: 16,
    fontWeight: '700',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: theme.primary,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  confirmDestructive: {
    backgroundColor: theme.danger,
  },
  confirmDestructiveText: {
    color: '#fff',
  },
  planCard: {
    gap: 14,
  },
  profileSwitcherButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  quickActionCard: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    minHeight: 112,
    justifyContent: 'center',
    width: '48%',
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  quickActionText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowGap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  iconRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  rowEnd: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  reminderSection: {
    marginTop: 16,
    marginBottom: 16,
    gap: 12,
  },
  reminderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  reminderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  reminderTextWrap: {
    flex: 1,
  },
  reminderText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
  },
  reminderSubtext: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  toggleButton: {
    width: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleButtonActive: {
    backgroundColor: theme.primary,
  },
  toggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleCircleActive: {
    alignSelf: 'flex-end',
  },
  timePickerRow: {
    gap: 8,
  },
  timeInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 12,
    borderWidth: 1,
    color: theme.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timeHint: {
    color: theme.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  editButton: {
    padding: 4,
  },
  screen: {
    backgroundColor: theme.background,
    flex: 1,
  },
  sectionGap: {
    gap: 16,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '800',
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  monthSelectorWrap: {
    marginBottom: 12,
  },
  yearNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 6,
  },
  yearNavArrow: {
    padding: 6,
  },
  yearNavArrowDisabled: {
    opacity: 0.3,
  },
  yearNavText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    minWidth: 48,
    textAlign: 'center',
  },
  monthScrollRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  archiveBadge: {
    backgroundColor: theme.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  archiveBadgeText: {
    fontSize: 12,
    color: theme.primary,
    fontWeight: '500',
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(45, 49, 47, 0.32)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: theme.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetContent: {
    gap: 16,
    paddingBottom: 32,
  },
  sheetGrabber: {
    alignSelf: 'center',
    backgroundColor: theme.border,
    borderRadius: 999,
    height: 5,
    marginBottom: 14,
    width: 44,
  },
  shoppingCard: {
    gap: 12,
  },
  deleteAction: {
    backgroundColor: theme.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 16,
    marginVertical: 4,
  },
  deleteButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  spacer12: {
    height: 12,
  },
  spacer16: {
    height: 16,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginVertical: 14,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  borrowRecordRow: {
    borderTopColor: theme.border,
    borderTopWidth: 1,
    marginTop: 6,
    paddingTop: 6,
  },
  borrowHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  switcherCard: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 18,
  },
  switcherEmoji: {
    fontSize: 24,
  },
  switcherHeader: {
    gap: 8,
  },
  switcherWrap: {
    gap: 16,
    padding: 20,
  },
  tabBadge: {
    right: -10,
    top: -8,
  },
  tabButton: {
    alignItems: 'center',
    gap: 6,
    minWidth: 64,
  },
  tabLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: theme.primary,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    marginTop: 8,
  },
  topBarSubtitle: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  topBarTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
});