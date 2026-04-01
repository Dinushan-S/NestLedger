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
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  avatarChoices,
  expenseCategories,
  expenseFilters,
  formatShortDate,
  rs,
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

type ExpenseForm = {
  category: string;
  customCategory: string;
  date: string;
  paidBy: string | null;
  price: string;
  title: string;
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
  paidBy: null,
  price: '',
  title: '',
});

const defaultShoppingForm: ShoppingForm = {
  category: '',
  name: '',
  quantity: '',
};

const defaultBudgetView = expenseFilters[1];

const extractError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
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
  const [pendingInviteToken, setPendingInviteToken] = useState(initialInviteToken ?? null);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profiles, setProfiles] = useState<HouseholdProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<BudgetPlan[]>([]);
  const [profileExpenses, setProfileExpenses] = useState<Expense[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [showBudgetComposer, setShowBudgetComposer] = useState(false);
  const [showExpenseComposer, setShowExpenseComposer] = useState(false);
  const [showExpenseFilters, setShowExpenseFilters] = useState(false);
  const [showShoppingComposer, setShowShoppingComposer] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);

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

  const seenNotificationIds = useRef<Set<string>>(new Set());
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [activeProfileId, profiles],
  );
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

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

  const spentByPlan = useMemo(() => {
    return profileExpenses.reduce<Record<string, number>>((accumulator, expense) => {
      accumulator[expense.plan_id] = (accumulator[expense.plan_id] ?? 0) + Number(expense.price ?? 0);
      return accumulator;
    }, {});
  }, [profileExpenses]);

  const personalContributions = useMemo(() => {
    const contributions: Record<string, { member: { avatar: string; name: string }; total: number }> = {};
    profileExpenses.forEach((expense) => {
      if (expense.paid_by) {
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
  }, [profileExpenses, memberMap]);

  const familyBudgetSpent = useMemo(() => {
    return profileExpenses
      .filter((expense) => !expense.paid_by)
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

    const base = profileExpenses.filter((expense) => expense.plan_id === selectedPlan.id);
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

        const savedId = await AsyncStorage.getItem(`nestledger-active-profile-${session.user.id}`);
        const fallback = nextProfiles.find((item) => item.id === savedId)?.id ?? nextProfiles[0]?.id ?? null;
        setActiveProfileId((previous) => previous ?? fallback);
        setSetupMessage(null);
      } catch (error) {
        const message = extractError(error);
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
        () => refreshProfileData(activeProfileId),
      )
      .on(
        'postgres_changes',
        { event: '*', filter: `profile_id=eq.${activeProfileId}`, schema: 'public', table: 'expenses' },
        () => refreshProfileData(activeProfileId),
      )
      .on(
        'postgres_changes',
        { event: '*', filter: `profile_id=eq.${activeProfileId}`, schema: 'public', table: 'buy_list_items' },
        () => refreshProfileData(activeProfileId),
      )
      .on(
        'postgres_changes',
        { event: '*', filter: `profile_id=eq.${activeProfileId}`, schema: 'public', table: 'profile_members' },
        () => refreshProfileData(activeProfileId),
      )
      .on(
        'postgres_changes',
        { event: '*', filter: `user_id=eq.${session.user.id}`, schema: 'public', table: 'notifications' },
        async (payload) => {
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeProfileId, session?.user?.id]);

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

  const refreshProfileData = async (profileId: string) => {
    if (!session?.user) {
      return;
    }

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

  const runAction = async (callback: () => Promise<void>) => {
    setActionBusy(true);
    try {
      await callback();
    } catch (error) {
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
      await budgetApi.createPlan({
        created_by: session.user.id,
        end_date: budgetForm.endDate,
        name: budgetForm.name,
        profile_id: activeProfile.id,
        start_date: budgetForm.startDate,
        total_amount: Number(budgetForm.totalAmount),
      });

      setBudgetForm(defaultBudgetForm());
      setShowBudgetComposer(false);
      await refreshProfileData(activeProfile.id);
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
    if (!session?.user || !activeProfile || !selectedPlan) {
      return;
    }

    if (!expenseForm.title.trim() || !expenseForm.price.trim()) {
      announce('Add an expense title and price.');
      return;
    }

    if (expenseForm.category === 'Other' && !expenseForm.customCategory.trim()) {
      announce('Please enter a custom category name.');
      return;
    }

    const category = expenseForm.category === 'Other' ? expenseForm.customCategory.trim() : expenseForm.category;

    await runAction(async () => {
      await expenseApi.addExpense({
        added_by: session.user.id,
        category,
        date: new Date(expenseForm.date).toISOString(),
        paid_by: expenseForm.paidBy,
        plan_id: selectedPlan.id,
        price: Number(expenseForm.price),
        profile_id: activeProfile.id,
        title: expenseForm.title.trim(),
      });

      await notifyOtherMembers(`${userProfile?.name ?? 'A member'} added ${expenseForm.title} to ${selectedPlan.name}.`, notificationTypes.expense);
      setExpenseForm(defaultExpenseForm());
      setShowExpenseComposer(false);
      await refreshProfileData(activeProfile.id);
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
      await refreshProfileData(activeProfile.id);
    });
  };

  const handleMarkBought = async (item: ShoppingItem) => {
    if (!session?.user || !activeProfile) {
      return;
    }

    await runAction(async () => {
      await shoppingApi.markBought(item.id, session.user.id);
      await notifyOtherMembers(
        `${userProfile?.name ?? 'A member'} marked ${item.name} as bought ✓`,
        notificationTypes.shoppingBought,
      );
      await refreshProfileData(activeProfile.id);
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
      Alert.alert(
        'Delete Space',
        'Are you sure you want to delete this space? All data will be permanently removed.',
        [
          { style: 'cancel', text: 'Cancel' },
          {
            onPress: performDelete,
            style: 'destructive',
            text: 'Delete',
          },
        ],
      );
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
  const activeBudgetSpent = activeBudget ? spentByPlan[activeBudget.id] ?? 0 : 0;
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
              {unreadCount ? (
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
                      <Text style={styles.bodyMuted}>of {rs(activeBudget?.total_amount ?? 0)}</Text>
                      <View style={styles.spacer12} />
                      <ProgressBar progress={activeBudget ? activeBudgetSpent / Math.max(activeBudget.total_amount, 1) : 0} />
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
                    {latestActivities.length ? (
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
                    <ModernButton onPress={() => setShowBudgetComposer(true)} secondary testID="budget-new-plan" text="New plan" />
                  </View>

                  {plans.map((plan) => {
                    const spent = spentByPlan[plan.id] ?? 0;
                    const remaining = Math.max(plan.total_amount - spent, 0);
                    return (
                      <Pressable key={plan.id} onPress={() => setSelectedPlanId(plan.id)} testID={`budget-plan-${plan.id}`}>
                        <BentoCard style={styles.planCard}>
                          <View style={styles.rowBetween}>
                            <View>
                              <Text style={styles.cardTitle}>{plan.name}</Text>
                              <Text style={styles.bodyMuted}>
                                {formatShortDate(plan.start_date)} → {formatShortDate(plan.end_date)}
                              </Text>
                            </View>
                            <Ionicons color={theme.primary} name="chevron-forward-circle-outline" size={26} />
                          </View>
                          <View style={styles.statRow}>
                            <InfoPill label="Budget" value={rs(plan.total_amount)} />
                            <InfoPill label="Spent" value={rs(spent)} />
                            <InfoPill label="Left" value={rs(remaining)} />
                          </View>
                          <ProgressBar progress={spent / Math.max(plan.total_amount, 1)} />
                        </BentoCard>
                      </Pressable>
                    );
                  })}

                  {!plans.length ? (
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

                  {filteredShoppingItems.length ? (
                    filteredShoppingItems.map((item) => {
                      const actor = memberMap.get(item.bought_by ?? item.added_by);
                      return (
                        <BentoCard key={item.id} style={styles.shoppingCard}>
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
                            <Pressable hitSlop={12} onPress={() => (!item.is_bought ? handleMarkBought(item) : undefined)} testID={`shopping-mark-bought-${item.id}`}>
                              <Ionicons
                                color={item.is_bought ? theme.success : theme.primary}
                                name={item.is_bought ? 'checkmark-circle' : 'checkmark-circle-outline'}
                                size={28}
                              />
                            </Pressable>
                          </View>
                        </BentoCard>
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

      <Modal animationType="slide" presentationStyle="pageSheet" visible={showBudgetComposer}>
        <ModalScaffold closeTestID="close-budget-modal" onClose={() => setShowBudgetComposer(false)} title="Create Budget Plan">
          <LabeledInput label="Plan name" onChangeText={(value) => setBudgetForm((current) => ({ ...current, name: value }))} testID="budget-plan-name-input" value={budgetForm.name} />
          <LabeledInput keyboardType="numeric" label="Total budget (Rs.)" onChangeText={(value) => setBudgetForm((current) => ({ ...current, totalAmount: value }))} testID="budget-plan-total-input" value={budgetForm.totalAmount} />
          <LabeledInput label="Start date (YYYY-MM-DD)" onChangeText={(value) => setBudgetForm((current) => ({ ...current, startDate: value }))} testID="budget-plan-start-input" value={budgetForm.startDate} />
          <LabeledInput label="End date (YYYY-MM-DD)" onChangeText={(value) => setBudgetForm((current) => ({ ...current, endDate: value }))} testID="budget-plan-end-input" value={budgetForm.endDate} />
          <ModernButton loading={actionBusy} onPress={handleCreateBudget} testID="budget-save-plan" text="Save plan" />
        </ModalScaffold>
      </Modal>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={Boolean(selectedPlan)}>
        <ModalScaffold closeTestID="close-budget-detail-modal" onClose={() => setSelectedPlanId(null)} title={selectedPlan?.name ?? 'Budget plan'}>
          {selectedPlan ? (
            <>
              <BentoCard tone="highlight">
                <Text style={styles.metricText}>{rs(spentByPlan[selectedPlan.id] ?? 0)}</Text>
                <Text style={styles.bodyMuted}>spent out of {rs(selectedPlan.total_amount)}</Text>
                <View style={styles.spacer12} />
                <ProgressBar progress={(spentByPlan[selectedPlan.id] ?? 0) / Math.max(selectedPlan.total_amount, 1)} />
              </BentoCard>

              <View style={styles.sectionGap}>
                <Text style={styles.inputLabel}>Spending Breakdown</Text>
                <View style={styles.statRow}>
                  <InfoPill label="Family Budget" value={rs(familyBudgetSpent)} />
                  {Object.values(personalContributions).map((contrib) => (
                    <InfoPill key={contrib.member.name} label={`${contrib.member.name}`} value={rs(contrib.total)} />
                  ))}
                </View>
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

              <ModernButton
                icon={<Ionicons color="#FFFFFF" name="add" size={18} />}
                onPress={() => setShowExpenseComposer(true)}
                testID="open-add-expense"
                text="Add expense"
              />

              {filteredExpenses.length ? (
                filteredExpenses.map((expense) => (
                  <BentoCard key={expense.id}>
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.listTitle}>{expense.title}</Text>
                        <Text style={styles.listSubtitle}>
                          {expense.category} • {formatShortDate(expense.date)}
                        </Text>
                        <Text style={styles.listSubtitle}>
                          {expense.paid_by ? `Paid by ${memberMap.get(expense.paid_by)?.name ?? 'Member'}` : 'Paid from Family Budget'}
                        </Text>
                      </View>
                      <Text style={styles.amountText}>{rs(expense.price)}</Text>
                    </View>
                  </BentoCard>
                ))
              ) : (
                <EmptyState body="Use the add button to capture a new family expense." title="No expenses in this view" />
              )}
            </>
          ) : null}
        </ModalScaffold>
      </Modal>

      <Modal animationType="slide" presentationStyle="formSheet" transparent visible={showExpenseComposer}>
        <BottomSheet onClose={() => setShowExpenseComposer(false)}>
          <Text style={styles.sectionTitle}>Add Expense</Text>
          <LabeledInput label="Title" onChangeText={(value) => setExpenseForm((current) => ({ ...current, title: value }))} testID="expense-title-input" value={expenseForm.title} />
          <LabeledInput keyboardType="numeric" label="Price (Rs.)" onChangeText={(value) => setExpenseForm((current) => ({ ...current, price: value }))} testID="expense-price-input" value={expenseForm.price} />
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
                onPress={() => setExpenseForm((current) => ({ ...current, paidBy: null }))}
              />
              {members.map((member) => (
                <CategoryChip
                  key={member.user_id}
                  active={expenseForm.paidBy === member.user_id}
                  label={member.user_profile?.name ?? 'Member'}
                  onPress={() => setExpenseForm((current) => ({ ...current, paidBy: member.user_id }))}
                />
              ))}
            </View>
          </View>
          <DatePickerField date={expenseForm.date} label="Date" onDateChange={(value) => setExpenseForm((current) => ({ ...current, date: value }))} testID="expense-date-input" />
          <View style={styles.spacer16} />
          <ModernButton loading={actionBusy} onPress={handleAddExpense} testID="expense-save-button" text="Save expense" />
        </BottomSheet>
      </Modal>

      <Modal animationType="slide" presentationStyle="formSheet" transparent visible={showShoppingComposer}>
        <BottomSheet onClose={() => setShowShoppingComposer(false)}>
          <Text style={styles.sectionTitle}>Add Shopping Item</Text>
          <LabeledInput label="Product name" onChangeText={(value) => setShoppingForm((current) => ({ ...current, name: value }))} testID="shopping-name-input" value={shoppingForm.name} />
          <LabeledInput label="Quantity (optional)" onChangeText={(value) => setShoppingForm((current) => ({ ...current, quantity: value }))} testID="shopping-quantity-input" value={shoppingForm.quantity} />
          <LabeledInput label="Category (optional)" onChangeText={(value) => setShoppingForm((current) => ({ ...current, category: value }))} testID="shopping-category-input" value={shoppingForm.category} />
          <ModernButton loading={actionBusy} onPress={handleAddShoppingItem} testID="shopping-save-button" text="Add item" />
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
          {notifications.length ? (
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