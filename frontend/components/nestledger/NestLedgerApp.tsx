import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import * as Device from "expo-device";
import { useRouter } from "expo-router";
import { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme as useAppTheme } from "../../lib/theme-context";
import {
	ActivityIndicator,
	AppState,
	Alert,
	Keyboard,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	Share,
	Text,
	TextInput,
	useWindowDimensions,
	View,
} from "react-native";
import {
	GestureHandlerRootView,
	Swipeable,
} from "react-native-gesture-handler";
import {
	useSafeAreaInsets,
	SafeAreaView,
} from "react-native-safe-area-context";

import {
	avatarChoices,
	expenseCategories,
	expenseFilters,
	formatCurrency,
	formatShortDate,
	shoppingCategories,
	shoppingFilters,
	getCycleWindowForCursor,
	parseDateOnly,
	todayLocalDate,
	toLocalDate,
} from "../../constants/nestledger";
import {
	AppNotification,
	BillPayment,
	BillTrackerMeta,
	BudgetPlan,
	ExpenseWithItems,
	HouseholdProfile,
	Member,
	RecurringBill,
	SavingsEntry,
	SavingsTrackerMeta,
	ShoppingItem,
	SpaceType,
	UserProfile,
	authApi,
	billApi,
	budgetApi,
	expenseApi,
	inviteApi,
	notificationApi,
	profileApi,
	pushApi,
	savingsApi,
	shoppingApi,
	validateSession,
} from "../../lib/nestledger";
import { isConfigReady } from "../../lib/config";
import * as Notifications from "../../lib/notifications";
import BentoCard from "../ui/BentoCard";
import CategoryChip from "../ui/CategoryChip";
import ModernButton from "../ui/ModernButton";
import MonthYearSelector from "../ui/MonthYearSelector";
import ProgressBar from "../ui/ProgressBar";
import { BottomSheet } from "../ui/BottomSheet";
import { ModalScaffold } from "../ui/ModalScaffold";
import OnboardingCarousel from "./OnboardingCarousel";
import {
	CreateProfileForm,
	LabeledInput,
	PasswordInput,
	ProfileFormFields,
} from "./forms/ProfileFormControls";
import { useNestLedgerBootstrap } from "./hooks/useNestLedgerBootstrap";
import { useProfileDataController } from "./hooks/useProfileDataController";
import { useRealtimeChannel } from "./hooks/useRealtimeChannel";
import {
	buildAvailableViewMonths,
	buildAvailableViewYears,
	buildCurrentMonthBillStatsMap,
	buildCurrentMonthSavingsStatsMap,
	buildCurrentMonthStatsMap,
	buildCurrentPlanExpenses,
	buildCurrentPlanMonthStats,
	buildMemberMap,
	filterExpensesForView,
	filterMonthExpenses,
	filterShoppingItems,
} from "./selectors";
import {
	deriveRecentExpenseItemSuggestions,
	applyRecentItemSuggestionToExpenseForm,
	type RecentExpenseItemSuggestion,
} from "./expenseSuggestions";
import { ReceiptScannerSheet } from "./ReceiptScannerSheet";
import {
	categoryForReceiptVendor,
	formatReceiptItemName,
	type ParsedReceipt,
} from "./receiptParser";
import { cancelExpenseReminders, restoreDailyReminder, updateDailyReminder } from "./reminders";
import { BillTracker as BillTrackerComponent } from "./BillTracker";
import { SavingsTracker as SavingsTrackerComponent } from "./SavingsTracker";
import AnalyseScreen from "./AnalyseScreen";
import DashboardTab from "./tabs/DashboardTab";
import BudgetTab from "./tabs/BudgetTab";
import ShoppingTab from "./tabs/ShoppingTab";
import ProfileTab from "./tabs/ProfileTab";
import {
	BorrowForm,
	BudgetForm,
	ExpenseForm,
	RepayForm,
	ShoppingForm,
	SPACE_TYPES,
	defaultBudgetForm,
	defaultBudgetView,
	defaultCreateProfileForm,
	defaultExpenseForm,
		defaultShoppingForm,
		extractError,
		isSchemaMissing,
		isSplitSpace,
		needsSpaceTypeMigration,
		notificationTypes,
		spaceTypeName,
} from "./nestledger.constants";
import { useStyles } from "./nestledger.styles";
import { ProfileSettingsModal } from "./settings/ProfileSettingsModal";
import {
	CenteredState,
	ConfirmModal,
	DatePickerField,
	EmptyState,
	InfoPill,
	SplashScreen,
	TabButton,
} from "./nestledger.ui";

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldPlaySound: true,
		shouldSetBadge: false,
		shouldShowBanner: true,
		shouldShowList: true,
	}),
});

type Props = {
	initialInviteToken?: string | undefined;
};

type TabKey = "dashboard" | "budget" | "shopping" | "profile";

export default function NestLedgerApp({ initialInviteToken }: Props) {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const isTablet = width >= 720;
	// Dynamic theme — reads from ThemeContext set up in the root layout
	const { theme } = useAppTheme();
	const styles = useStyles();
	const bentoWidth = isTablet ? (width - 72) / 2 : width - 40;

	const [booting, setBooting] = useState(true);
	const [busy, setBusy] = useState(false);
	const [authBusy, setAuthBusy] = useState(false);
	const [actionBusy, setActionBusy] = useState(false);
	const [session, setSession] = useState<Session | null>(null);
	const sessionUserId = session?.user?.id;
	const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
	const [authForm, setAuthForm] = useState({ email: "", password: "" });
	const [authMessage, setAuthMessage] = useState<string | null>(null);
	const [resetCodeSent, setResetCodeSent] = useState(false);
	const authPasswordInputRef = useRef<TextInput>(null);
	const [setupMessage, setSetupMessage] = useState<string | null>(null);
	const [profileLoaded, setProfileLoaded] = useState(false);
	const [pendingInviteToken, setPendingInviteToken] = useState(
		initialInviteToken ?? null,
	);

	const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
	const [profiles, setProfiles] = useState<HouseholdProfile[]>([]);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<TabKey>("dashboard");

	const [members, setMembers] = useState<Member[]>([]);
	const [plans, setPlans] = useState<BudgetPlan[]>([]);
	const [profileExpenses, setProfileExpenses] = useState<ExpenseWithItems[]>(
		[],
	);
	const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
	const [notifications, setNotifications] = useState<AppNotification[]>([]);
	const [billTrackers, setBillTrackers] = useState<BillTrackerMeta[]>([]);
	const [savingsTrackers, setSavingsTrackers] = useState<SavingsTrackerMeta[]>(
		[],
	);
	const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
	const [billPayments, setBillPayments] = useState<BillPayment[]>([]);
	const [savings, setSavings] = useState<SavingsEntry[]>([]);

	const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
	const [showCreateProfile, setShowCreateProfile] = useState(false);
	const [showBudgetComposer, setShowBudgetComposer] = useState(false);
	const [showExpenseComposer, setShowExpenseComposer] = useState(false);
	const [showMoreExpenseCategories, setShowMoreExpenseCategories] = useState(false);
	const [activeExpenseItemSuggestionIndex, setActiveExpenseItemSuggestionIndex] =
		useState<number | null>(null);
	const [showReceiptScanner, setShowReceiptScanner] = useState(false);
	const [showExpenseFilters, setShowExpenseFilters] = useState(false);
	const [showBorrowComposer, setShowBorrowComposer] = useState(false);
	const [showRepayComposer, setShowRepayComposer] = useState(false);
	const [editingBorrowId, setEditingBorrowId] = useState<string | null>(null);
	const [expandedBorrowUser, setExpandedBorrowUser] = useState<string | null>(
		null,
	);
	const [borrowForm, setBorrowForm] = useState<BorrowForm>({
		amount: "",
		date: todayLocalDate(),
		description: "",
	});
	const [repayForm, setRepayForm] = useState<RepayForm>({
		amount: "",
		borrowId: "",
		date: todayLocalDate(),
	});
	const [showShoppingComposer, setShowShoppingComposer] = useState(false);
	const [showBoughtComposer, setShowBoughtComposer] = useState(false);
	const [boughtForm, setBoughtForm] = useState({
		price: "",
		paidBy: null as string | null,
		planId: "",
	});
	const [pendingBoughtItem, setPendingBoughtItem] =
		useState<ShoppingItem | null>(null);
	const [showMembers, setShowMembers] = useState(false);
	const [showInvite, setShowInvite] = useState(false);
	const [showNotifications, setShowNotifications] = useState(false);
	const [showOnboarding, setShowOnboarding] = useState(false);
	const [onboardingLoaded, setOnboardingLoaded] = useState(false);
	const [showProfileSettings, setShowProfileSettings] = useState(false);
	const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
	const [profileSetupStep, setProfileSetupStep] = useState<"type" | "details">(
		"type",
	);
	const [showBreakdownDetails, setShowBreakdownDetails] = useState(false);
	const [showAnalyse, setShowAnalyse] = useState(false);
	const [migrationSpaceType, setMigrationSpaceType] =
		useState<SpaceType>("family");
	const [migrationCardVisible, setMigrationCardVisible] = useState(false);
	const onboardingStorageKey = sessionUserId
		? `nestledger-onboarding-seen-${sessionUserId}`
		: null;
	const onboardingPrimaryActionText =
		userProfile && profiles.length > 0
			? "Open your space"
			: "Continue to setup";
	const activeProfile = useMemo(
		() => profiles.find((profile) => profile.id === activeProfileId) ?? null,
		[activeProfileId, profiles],
	);
	const userCurrency = activeProfile?.currency ?? userProfile?.currency ?? "USD";
	const c = useCallback(
		(value: number) => formatCurrency(value, userCurrency),
		[userCurrency],
	);

	const [reminderEnabled, setReminderEnabled] = useState(false);
	const [reminderTime, setReminderTime] = useState("20:00"); // Default 8 PM
	const [reminderBusy, setReminderBusy] = useState(false);
	const [pendingDailyReminder, setPendingDailyReminder] = useState(false);
	const [androidKeyboardVisible, setAndroidKeyboardVisible] = useState(false);

	useEffect(() => {
		if (Platform.OS !== "android") return;
		const showSubscription = Keyboard.addListener("keyboardDidShow", () =>
			setAndroidKeyboardVisible(true),
		);
		const hideSubscription = Keyboard.addListener("keyboardDidHide", () =>
			setAndroidKeyboardVisible(false),
		);
		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, []);

	const [confirmModal, setConfirmModal] = useState<{
		body: string;
		confirmText?: string;
		destructive?: boolean;
		onConfirm: () => void;
		title: string;
		visible: boolean;
	} | null>(null);

	const [profileForm, setProfileForm] = useState<CreateProfileForm>(
		defaultCreateProfileForm,
	);
	const [budgetForm, setBudgetForm] = useState<BudgetForm>(defaultBudgetForm());
	const [expenseForm, setExpenseForm] = useState<ExpenseForm>(
		defaultExpenseForm(),
	);
	const originalExpenseForm = useRef<ExpenseForm | null>(null);
	const [shoppingForm, setShoppingForm] =
		useState<ShoppingForm>(defaultShoppingForm);
	const [inviteEmail, setInviteEmail] = useState("");
	const [lastInviteLink, setLastInviteLink] = useState("");
	const [expenseView, setExpenseView] =
		useState<(typeof expenseFilters)[number]>(defaultBudgetView);
	const [expenseCategoryFilter, setExpenseCategoryFilter] = useState("All");
	const [shoppingFilter, setShoppingFilter] =
		useState<(typeof shoppingFilters)[number]>("All");

	const [deletingProfileIds, setDeletingProfileIds] = useState<Set<string>>(
		new Set(),
	);
	const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
	const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
	const [budgetEditMode, setBudgetEditMode] = useState(false);
	const [editingBillTrackerId, setEditingBillTrackerId] = useState<
		string | null
	>(null);
	const [editingSavingsTrackerId, setEditingSavingsTrackerId] = useState<
		string | null
	>(null);
	const [editBillTrackerForm, setEditBillTrackerForm] = useState({ name: "" });
	const [editSavingsTrackerForm, setEditSavingsTrackerForm] = useState({
		name: "",
	});
	const [selectedBillTrackerId, setSelectedBillTrackerId] = useState<
		string | null
	>(null);
	const [selectedSavingsTrackerId, setSelectedSavingsTrackerId] = useState<
		string | null
	>(null);
	const [billTrackerDetailLoading, setBillTrackerDetailLoading] =
		useState(false);
	const [savingsTrackerDetailLoading, setSavingsTrackerDetailLoading] =
		useState(false);

	const [activeViewYear, setActiveViewYear] = useState<number>(
		new Date().getFullYear(),
	);
	const [activeViewMonth, setActiveViewMonth] = useState<number | "current">(
		"current",
	);
	const [billViewYear, setBillViewYear] = useState<number>(
		new Date().getFullYear(),
	);
	const [billViewMonth, setBillViewMonth] = useState<number | "current">(
		"current",
	);
	const [savingsViewYear, setSavingsViewYear] = useState<number>(
		new Date().getFullYear(),
	);
	const [savingsViewMonth, setSavingsViewMonth] = useState<number | "current">(
		"current",
	);

	const resetSessionState = useCallback(() => {
		void cancelExpenseReminders().catch(() => undefined);
		setAuthForm({ email: "", password: "" });
		setProfiles([]);
		setActiveProfileId(null);
		setUserProfile(null);
		setProfileLoaded(false);
		setMembers([]);
		setPlans([]);
		setProfileExpenses([]);
		setShoppingItems([]);
		setNotifications([]);
		setBillTrackers([]);
		setSavingsTrackers([]);
		setRecurringBills([]);
		setSelectedPlanId(null);
		setPendingDailyReminder(false);
		setBillPayments([]);
		setSavings([]);
	}, []);

	useNestLedgerBootstrap({
		activeProfileId,
		onSchemaMissing: isSchemaMissing,
		onSessionCleared: resetSessionState,
		sessionUserId,
		setActiveProfileId,
		setBooting,
		setBusy,
		setProfileLoaded,
		setProfiles,
		setSession,
		setSetupMessage,
		setUserProfile,
	});

	const { refreshProfileData, seenNotificationIds } = useProfileDataController({
		onError: setSetupMessage,
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
	});

	const selectedPlan = useMemo(
		() => plans.find((plan) => plan.id === selectedPlanId) ?? null,
		[plans, selectedPlanId],
	);
	const selectedPlanAnchorDay = useMemo(
		() => (selectedPlan ? parseDateOnly(selectedPlan.start_date).getDate() : 1),
		[selectedPlan],
	);

	// Derived space helpers
	const showSplitFields = isSplitSpace(activeProfile?.space_type);
	const [contributionEnabled, setContributionEnabled] = useState(false);
	const showContribution = showSplitFields || contributionEnabled;

	const availableViewYears = useMemo(
		() => buildAvailableViewYears(profileExpenses, selectedPlan),
		[profileExpenses, selectedPlan],
	);

	const availableViewMonths = useMemo(
		() =>
			buildAvailableViewMonths(activeViewYear, profileExpenses, selectedPlan),
		[activeViewYear, profileExpenses, selectedPlan],
	);

	const isViewingArchive = activeViewMonth !== "current";

	const monthFilteredExpenses = useMemo(
		() =>
			filterMonthExpenses({
				activeViewMonth,
				activeViewYear,
				profileExpenses,
				selectedPlan,
			}),
		[activeViewMonth, activeViewYear, profileExpenses, selectedPlan],
	);

	const memberMap = useMemo(() => buildMemberMap(members), [members]);
	const currentPlanExpenses = useMemo(
		() => buildCurrentPlanExpenses(plans, profileExpenses),
		[plans, profileExpenses],
	);
	const currentMonthStatsMap = useMemo(
		() => buildCurrentMonthStatsMap(plans, profileExpenses),
		[plans, profileExpenses],
	);
	const currentMonthBillStatsMap = useMemo(
		() =>
			buildCurrentMonthBillStatsMap(billPayments, billTrackers, recurringBills),
		[billPayments, billTrackers, recurringBills],
	);
	const currentMonthSavingsStatsMap = useMemo(
		() => buildCurrentMonthSavingsStatsMap(savings, savingsTrackers),
		[savings, savingsTrackers],
	);
	const filteredShoppingItems = useMemo(
		() => filterShoppingItems(shoppingFilter, shoppingItems),
		[shoppingFilter, shoppingItems],
	);
	const currentPlanMonthStats = useMemo(
		() =>
			buildCurrentPlanMonthStats(currentPlanExpenses, memberMap, selectedPlan),
		[currentPlanExpenses, memberMap, selectedPlan],
	);
	const filteredExpenses = useMemo(
		() =>
			filterExpensesForView({
				expenseCategoryFilter,
				expenseView,
				profileExpenses,
				selectedPlan,
			}),
		[expenseCategoryFilter, expenseView, profileExpenses, selectedPlan],
	);
	const recentItemSuggestions = useMemo(() => {
		if (activeExpenseItemSuggestionIndex === null) {
			return [];
		}

		return deriveRecentExpenseItemSuggestions(
			profileExpenses,
			expenseForm.items[activeExpenseItemSuggestionIndex]?.name ?? "",
		);
	}, [activeExpenseItemSuggestionIndex, expenseForm.items, profileExpenses]);

	const unreadCount = notifications.filter((item) => !item.is_read).length;
	const shoppingBadgeCount = notifications.filter(
		(item) => !item.is_read && item.type.startsWith("shopping_"),
	).length;

	useEffect(() => {
		if (!sessionUserId || !onboardingStorageKey) {
			setOnboardingLoaded(false);
			setShowOnboarding(false);
			return;
		}

		let mounted = true;

		AsyncStorage.getItem(onboardingStorageKey)
			.then((savedValue) => {
				if (!mounted) {
					return;
				}

				setShowOnboarding(savedValue !== "true");
				setOnboardingLoaded(true);
			})
			.catch(() => {
				if (!mounted) {
					return;
				}

				setShowOnboarding(true);
				setOnboardingLoaded(true);
			});

		return () => {
			mounted = false;
		};
	}, [onboardingStorageKey, sessionUserId]);

	// Repair saved reminders at login and when returning from phone settings.
	useEffect(() => {
		if (!sessionUserId || Platform.OS === "web") return;
		let active = true;
		const restore = async () => {
			try {
				if (!active) return;
				const { enabled, time } = await restoreDailyReminder();
				if (active) { setReminderEnabled(enabled); setReminderTime(time); }
			} catch (error) {
				if (active) { setReminderEnabled(false); Alert.alert("Reminder needs attention", extractError(error)); }
			}
		};
		void restore();
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") void restore();
		});
		return () => { active = false; subscription.remove(); };
	}, [sessionUserId]);

	const toggleReminder = async (enabled: boolean) => {
		if (reminderBusy) return;
		setReminderBusy(true);
		try {
			await updateDailyReminder(enabled, reminderTime);
			setReminderEnabled(enabled);
		} catch (error) {
			announce(extractError(error));
		} finally { setReminderBusy(false); }
	};

	const updateReminderTime = async () => {
		if (reminderBusy) return;
		setReminderBusy(true);
		try {
			await updateDailyReminder(reminderEnabled, reminderTime);
		} catch (error) {
			setReminderTime(await AsyncStorage.getItem("nestledger-reminder-time") || "20:00");
			announce(extractError(error));
		} finally { setReminderBusy(false); }
	};

	useEffect(() => {
		if (!sessionUserId || !activeProfileId) {
			return;
		}

		refreshProfileData(activeProfileId);
	}, [activeProfileId, refreshProfileData, seenNotificationIds, sessionUserId]);

	// Load contribution-enabled preference per profile
	useEffect(() => {
		if (!activeProfileId) {
			setContributionEnabled(false);
			return;
		}
		AsyncStorage.getItem(`nestledger-contribution-enabled-${activeProfileId}`)
			.then((val) => setContributionEnabled(val === "true"))
			.catch(() => setContributionEnabled(false));
	}, [activeProfileId]);

	const handleToggleContribution = useCallback(async () => {
		if (!activeProfileId) return;
		const next = !contributionEnabled;
		setContributionEnabled(next);
		await AsyncStorage.setItem(
			`nestledger-contribution-enabled-${activeProfileId}`,
			next ? "true" : "false",
		);
	}, [activeProfileId, contributionEnabled]);

	// Show migration card only when the persisted profile value is missing.
	// Do not use AsyncStorage here: a completed choice must follow the profile
	// when the user signs in on another phone.
	useEffect(() => {
		if (!activeProfileId || !activeProfile) {
			setMigrationCardVisible(false);
			return;
		}

		if (!needsSpaceTypeMigration(activeProfile.space_type)) {
			setMigrationCardVisible(false);
			return;
		}

		setMigrationSpaceType((activeProfile.space_type as SpaceType) ?? "family");
		setMigrationCardVisible(true);
	}, [activeProfile, activeProfileId]);

	useRealtimeChannel({
		activeProfileId,
		refreshProfileData,
		seenNotificationIds,
		sessionUserId,
	});

	useEffect(() => {
		if (!selectedPlanId) return;
		setActiveViewYear(new Date().getFullYear());
		setActiveViewMonth("current");
		setShowBreakdownDetails(false);
	}, [selectedPlanId]);

	useEffect(() => {
		if (!selectedBillTrackerId || !activeProfileId) {
			setBillTrackerDetailLoading(false);
			return;
		}

		let active = true;
		setBillTrackerDetailLoading(true);

		refreshProfileData(activeProfileId, true).finally(() => {
			if (active) {
				setBillTrackerDetailLoading(false);
			}
		});

		return () => {
			active = false;
		};
	}, [activeProfileId, refreshProfileData, selectedBillTrackerId]);

	useEffect(() => {
		if (!selectedSavingsTrackerId || !activeProfileId) {
			setSavingsTrackerDetailLoading(false);
			return;
		}

		let active = true;
		setSavingsTrackerDetailLoading(true);

		refreshProfileData(activeProfileId, true).finally(() => {
			if (active) {
				setSavingsTrackerDetailLoading(false);
			}
		});

		return () => {
			active = false;
		};
	}, [activeProfileId, refreshProfileData, selectedSavingsTrackerId]);

	useEffect(() => {
		if (!session) {
			return;
		}

		const register = async () => {
			try {
				if (Platform.OS === "android") {
					await Notifications.setNotificationChannelAsync("default", {
						name: "Default",
						importance: Notifications.AndroidImportance.HIGH,
						sound: "default",
					});
				}

				const permissions = await Notifications.requestPermissionsAsync();
				if (permissions.status !== "granted") {
					return;
				}

				const projectId = (
					Constants.expoConfig?.extra as
						| { eas?: { projectId?: string } }
						| undefined
				)?.eas?.projectId;

				if (!projectId) {
					return;
				}

				const token = await Notifications.getExpoPushTokenAsync({ projectId });
				await pushApi.registerToken(
					validateSession(session),
					token.data,
					Platform.OS,
				);
			} catch {
				// Silent: preview and unmanaged environments may not expose push tokens.
			}
		};

		// Remote push is unsupported on a simulator, and on Android inside Expo Go.
		const canRegister = Device.isDevice && !(Platform.OS === "android" && isRunningInExpoGo());
		if (canRegister) void register();
	}, [session]);

	// Route notification taps (foreground, background, and cold start) to the relevant screen.
	const lastNotificationResponse = Notifications.useLastNotificationResponse();
	const handledNotification = useRef<string | null>(null);
	useEffect(() => {
		if (!sessionUserId || !profileLoaded || !lastNotificationResponse) return;
		const responseKey = `${lastNotificationResponse.notification.request.identifier}:${lastNotificationResponse.notification.date}`;
		if (handledNotification.current === responseKey) return;
		const data = lastNotificationResponse?.notification.request.content.data as
			| { type?: string; profile_id?: string }
			| undefined;
		if (!data) {
			return;
		}
		if (data.profile_id && !profiles.some((profile) => profile.id === data.profile_id)) return;
		handledNotification.current = responseKey;
		void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);

		if (data.profile_id && data.profile_id !== activeProfileId) {
			setSelectedPlanId(null);
			setActiveProfileId(data.profile_id);
		}

		switch (data.type) {
			case "daily_expense_reminder":
				setActiveTab("dashboard");
				setPendingDailyReminder(true);
				if (!selectedPlan) Alert.alert("Add an expense", "Choose a budget plan to continue adding your expense.");
				break;
			case notificationTypes.shoppingAdded:
			case notificationTypes.shoppingBought:
				setActiveTab("shopping");
				break;
			case notificationTypes.expense:
				setActiveTab("dashboard");
				break;
			case notificationTypes.join:
				setActiveTab("dashboard");
				setShowNotifications(true);
				break;
			default:
				setShowNotifications(true);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lastNotificationResponse, sessionUserId, profileLoaded, profiles]);

	useEffect(() => {
		if (!pendingDailyReminder || !sessionUserId || !selectedPlan || selectedPlan.profile_id !== activeProfileId) return;
		setPendingDailyReminder(false);
		setEditingExpenseId(null);
		setExpenseForm({ ...defaultExpenseForm(), date: todayLocalDate() });
		setShowExpenseComposer(true);
	}, [pendingDailyReminder, selectedPlan, sessionUserId, activeProfileId]);

	const announce = useCallback((message: string) => {
		if (Platform.OS === "web") {
			globalThis.alert?.(message);
			return;
		}

		Alert.alert("NestLedger", message);
	}, []);

	const closeExpenseComposer = useCallback(() => {
		const discard = () => {
			setShowExpenseComposer(false);
			setActiveExpenseItemSuggestionIndex(null);
			setEditingExpenseId(null);
			setExpenseForm(defaultExpenseForm());
		};
		const hasDraft = editingExpenseId !== null
			? JSON.stringify(expenseForm) !== JSON.stringify(originalExpenseForm.current)
			: JSON.stringify(expenseForm) !== JSON.stringify(defaultExpenseForm());
		if (!hasDraft) {
			discard();
		} else if (Platform.OS === "web") {
			if (globalThis.confirm?.("Discard this expense draft?")) discard();
		} else {
			Alert.alert("Discard expense?", "Your unsaved expense changes will be lost.", [
				{ text: "Keep editing", style: "cancel" },
				{ text: "Discard", style: "destructive", onPress: discard },
			]);
		}
	}, [editingExpenseId, expenseForm]);

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

	const runAction = useCallback(
		async (callback: () => Promise<void>) => {
			setActionBusy(true);
			try {
				await callback();
			} catch (error) {
				announce(extractError(error));
			} finally {
				setActionBusy(false);
			}
		},
		[announce],
	);

	const handleSignOut = async () => {
		setShowProfileSettings(false);
		setShowProfileSwitcher(false);
		await authApi.signOut();
	};

	const handleAuth = async () => {
		if (!authForm.email || !authForm.password) {
			setAuthMessage("Enter your email and password to continue.");
			return;
		}

		setAuthBusy(true);
		setAuthMessage(null);

		try {
			if (authMode === "signin") {
				await authApi.signIn(authForm);
			} else {
				const result = await authApi.signUp(authForm);
				if (!result.session) {
					router.push({
						pathname: "/confirm-email",
						params: {
							email: authForm.email.trim(),
							token: pendingInviteToken ?? "",
						},
					});
				}
			}
			setAuthForm({ email: "", password: "" });
		} catch (error) {
			setAuthMessage(extractError(error));
		} finally {
			setAuthBusy(false);
		}
	};

	const handlePasswordReset = async () => {
		const email = authForm.email.trim();
		if (!email) {
			setAuthMessage("Enter your email address first.");
			return;
		}
		setAuthBusy(true);
		setAuthMessage(null);
		try {
			await authApi.resetPasswordForEmail(email);
			setResetCodeSent(true);
			router.push({ pathname: "/reset-password", params: { email } });
		} catch (error) {
			setAuthMessage(extractError(error));
		} finally {
			setAuthBusy(false);
		}
	};

	const completeOnboarding = useCallback(async () => {
		setShowProfileSettings(false);
		setShowOnboarding(false);

		if (!onboardingStorageKey) {
			return;
		}

		try {
			await AsyncStorage.setItem(onboardingStorageKey, "true");
		} catch {
			// Silent: failing to persist should not block the user from moving forward.
		}
	}, [onboardingStorageKey]);

	const handleCreateProfile = async () => {
		if (!session?.user) {
			return;
		}

		if (!profileForm.name.trim() || !profileForm.familyName.trim()) {
			announce("Add your name and the space name first.");
			return;
		}

		await runAction(async () => {
			const profile = await profileApi.createHousehold({
				avatarEmoji: profileForm.avatarEmoji,
				currency: profileForm.currency,
				familyEmoji: profileForm.familyEmoji,
				familyName: profileForm.familyName,
				name: profileForm.name,
				spaceType: (profileForm.spaceType as SpaceType) ?? "personal",
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
			announce("Add a plan name and total budget amount.");
			return;
		}

		await runAction(async () => {
			if (editingPlanId) {
				const updated = await budgetApi.updatePlan(editingPlanId, {
					end_date: budgetForm.endDate,
					name: budgetForm.name,
					start_date: budgetForm.startDate,
					total_amount: Number(budgetForm.totalAmount),
				});
				setPlans((prev) =>
					prev.map((p) => (p.id === updated.id ? updated : p)),
				);
				setEditingPlanId(null);
			} else {
				const created = await budgetApi.createPlan({
					created_by: session.user.id,
					end_date: budgetForm.endDate,
					name: budgetForm.name,
					profile_id: activeProfile.id,
					start_date: budgetForm.startDate,
					total_amount: Number(budgetForm.totalAmount),
				});
				setPlans((prev) => [created, ...prev]);
			}

			setBudgetForm(defaultBudgetForm());
			setShowBudgetComposer(false);
			// The write result is already applied locally; the full refetch is only
			// reconciliation and must not hold the spinner (each round trip costs
			// ~1-2s on far-from-region networks).
			void refreshProfileData(activeProfile.id, true);
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
			confirmText: "Delete",
			destructive: true,
			onConfirm: () => {
				runAction(async () => {
					await budgetApi.deletePlan(planId);
					setSelectedPlanId(null);
					setPlans((prev) => prev.filter((p) => p.id !== planId));
					setProfileExpenses((prev) =>
						prev.filter((e) => e.plan_id !== planId),
					);
					void refreshProfileData(activeProfile.id, true);
				});
			},
			title: "Delete Budget Plan",
		});
	};

	const handleResetBudget = async (planId: string, planName: string) => {
		if (!activeProfile) {
			return;
		}

		showConfirm({
			body: `Clear all expenses and borrows for "${planName}"? This cannot be undone.`,
			confirmText: "Reset",
			destructive: true,
			onConfirm: () => {
				runAction(async () => {
					await expenseApi.clearPlanExpenses(planId);
					setProfileExpenses((prev) =>
						prev.filter((e) => e.plan_id !== planId),
					);
					void refreshProfileData(activeProfile.id, true);
				});
			},
			title: "Reset Budget",
		});
	};

	const notifyOtherMembers = async (message: string, type: string) => {
		if (!session?.user || !activeProfile) {
			return;
		}

		const recipients = members
			.filter((item) => item.user_id !== session.user.id)
			.map((item) => item.user_id);
		if (!recipients.length) {
			return;
		}

		// Best-effort, fire-and-forget: notification delivery (the in-app write and
		// the push-fanout backend round-trip) must never block or fail a user
		// action like saving an expense. Callers may `await` this safely — it
		// resolves immediately and does the work in the background.
		void (async () => {
			try {
				await notificationApi.createForMembers(
					activeProfile.id,
					recipients,
					message,
					type,
				);
				await pushApi.fanOut(validateSession(session), {
					exclude_user_id: session.user.id,
					message,
					profile_id: activeProfile.id,
					type,
				});
			} catch {
				// Swallow: a failed/slow notification should not surface to the user.
			}
		})();
	};

	const [showNewPlanComposer, setShowNewPlanComposer] = useState(false);
	const [newPlanType, setNewPlanType] = useState<"budget" | "bill" | "savings">(
		"budget",
	);
	const [newPlanName, setNewPlanName] = useState("");

	const handleCreateTracker = async () => {
		if (!session?.user || !activeProfile) return;
		if (!newPlanName.trim()) {
			announce("Enter a name for the tracker.");
			return;
		}
		await runAction(async () => {
			if (newPlanType === "bill") {
				const created = await billApi.createTracker({
					created_by: session.user.id,
					name: newPlanName.trim(),
					profile_id: activeProfile.id,
				});
				setBillTrackers((prev) => [created, ...prev]);
			} else if (newPlanType === "savings") {
				const created = await savingsApi.createTracker({
					created_by: session.user.id,
					name: newPlanName.trim(),
					profile_id: activeProfile.id,
				});
				setSavingsTrackers((prev) => [created, ...prev]);
			}
			setNewPlanName("");
			setShowNewPlanComposer(false);
			void refreshProfileData(activeProfile.id, true);
		});
	};

	const handleDeleteTracker = (
		type: "bill" | "savings",
		id: string,
		name: string,
	) => {
		if (!activeProfile) return;
		showConfirm({
			body: `Are you sure you want to delete "${name}" and all its data?`,
			confirmText: "Delete",
			destructive: true,
			onConfirm: () => {
				runAction(async () => {
					if (type === "bill") {
						await billApi.deleteTracker(id);
						setBillTrackers((prev) => prev.filter((t) => t.id !== id));
						setRecurringBills((prev) =>
							prev.filter((b) => b.tracker_id !== id),
						);
						setBillPayments((prev) => prev.filter((p) => p.tracker_id !== id));
					} else {
						await savingsApi.deleteTracker(id);
						setSavingsTrackers((prev) => prev.filter((t) => t.id !== id));
						setSavings((prev) =>
							prev.filter((entry) => entry.tracker_id !== id),
						);
					}
					void refreshProfileData(activeProfile.id, true);
				});
			},
			title: "Delete Tracker",
		});
	};

	const handleEditTracker = async () => {
		if (!activeProfile) return;
		await runAction(async () => {
			if (editingBillTrackerId) {
				const updated = await billApi.updateTracker(
					editingBillTrackerId,
					editBillTrackerForm,
				);
				setBillTrackers((prev) =>
					prev.map((t) => (t.id === updated.id ? updated : t)),
				);
				setEditingBillTrackerId(null);
				setEditBillTrackerForm({ name: "" });
			}
			if (editingSavingsTrackerId) {
				const updated = await savingsApi.updateTracker(
					editingSavingsTrackerId,
					editSavingsTrackerForm,
				);
				setSavingsTrackers((prev) =>
					prev.map((t) => (t.id === updated.id ? updated : t)),
				);
				setEditingSavingsTrackerId(null);
				setEditSavingsTrackerForm({ name: "" });
			}
			void refreshProfileData(activeProfile.id, true);
		});
	};

	const handleAddBillToTracker = (
		trackerId: string,
		bill: Omit<RecurringBill, "created_at" | "id">,
	) => {
		if (!activeProfile) return;
		runAction(async () => {
			const created = await billApi.createRecurringBill({
				...bill,
				tracker_id: trackerId,
			});
			setRecurringBills((prev) => [...prev, created]);
			void refreshProfileData(activeProfile.id, true);
		});
	};

	const handleDeleteBillFromTracker = (billId: string) => {
		if (!activeProfile) return;
		showConfirm({
			body: "Delete this recurring bill? All pending payments will also be removed.",
			confirmText: "Delete",
			destructive: true,
			onConfirm: () => {
				runAction(async () => {
					await billApi.deleteRecurringBill(billId);
					setRecurringBills((prev) => prev.filter((b) => b.id !== billId));
					setBillPayments((prev) => prev.filter((p) => p.bill_id !== billId));
					void refreshProfileData(activeProfile.id, true);
				});
			},
			title: "Delete Bill",
		});
	};

	const handleMarkBillPaid = async (
		trackerId: string,
		payment: Omit<BillPayment, "created_at" | "id" | "name">,
		paymentName: string | null,
	) => {
		if (!activeProfile || !session?.user) return;
		await runAction(async () => {
			// The payment row and the linked budget expense are independent writes,
			// so they still share one round trip. allSettled rather than all: if the
			// expense fails the payment has already committed, and hiding it would
			// leave the list disagreeing with the database until the next refresh.
			const [paymentResult, expenseResult] = await Promise.allSettled([
				billApi.addPayment({ ...payment, tracker_id: trackerId }),
				payment.plan_id && payment.amount > 0
					? expenseApi.addExpense(
							{
								plan_id: payment.plan_id,
								profile_id: payment.profile_id,
								description: paymentName ?? "Bill payment",
								category: "Utilities",
								date: payment.date ?? todayLocalDate(),
								added_by: payment.added_by,
								paid_by:
									payment.added_by !== session.user.id ? payment.added_by : null,
								is_borrow: false,
								used_by: null,
								items: [{ name: "Bill payment", price: payment.amount }],
							},
							"id",
						)
					: Promise.resolve(null),
			]);

			if (paymentResult.status === "rejected") throw paymentResult.reason;
			setBillPayments((prev) => [paymentResult.value, ...prev]);
			await notifyOtherMembers(
				`${userProfile?.name ?? "A member"} paid a bill (${c(payment.amount)})`,
				notificationTypes.expense,
			);
			void refreshProfileData(activeProfile.id, true);

			// Reported only after the payment is reflected, so the message describes
			// a half-finished action rather than an apparently failed one.
			if (expenseResult.status === "rejected") {
				throw new Error(
					`Payment saved, but the matching ${c(payment.amount)} budget expense could not be created. Check the budget total and add it manually if it is short.`,
				);
			}
		});
	};

	const handleAddSaving = (
		trackerId: string,
		entry: Omit<SavingsEntry, "created_at" | "id">,
	) => {
		if (!activeProfile) return;
		runAction(async () => {
			const saved = await savingsApi.addEntry({
				...entry,
				tracker_id: trackerId,
			});
			setSavings((prev) => [saved, ...prev]);
			await notifyOtherMembers(
				`${userProfile?.name ?? "A member"} deposited ${c(entry.amount)} to savings`,
				notificationTypes.expense,
			);
			void refreshProfileData(activeProfile.id, true);
		});
	};

	const handleDeleteSavingEntry = (entryId: string) => {
		if (!activeProfile) return;
		showConfirm({
			body: "Delete this savings entry?",
			confirmText: "Delete",
			destructive: true,
			onConfirm: () => {
				runAction(async () => {
					await savingsApi.deleteEntry(entryId);
					setSavings((prev) => prev.filter((entry) => entry.id !== entryId));
					void refreshProfileData(activeProfile.id, true);
				});
			},
			title: "Delete Entry",
		});
	};

	const handleAddExpense = async () => {
		if (!session?.user || !activeProfile || !selectedPlan) {
			return;
		}

		const validItems = expenseForm.items.filter(
			(item) => item.name.trim() && item.price.trim(),
		);
		if (validItems.length === 0) {
			announce("Add at least one item with name and price.");
			return;
		}
		if (validItems.length !== expenseForm.items.length) {
			announce("Complete or remove each expense item before saving.");
			return;
		}
		if (validItems.some((item) => !Number.isFinite(Number(item.price)))) {
			announce("Enter a valid price for each expense item.");
			return;
		}
		const expenseDraft = expenseForm;

		if (
			expenseForm.category === "Other" &&
			!expenseForm.customCategory.trim()
		) {
			announce("Please enter a custom category name.");
			return;
		}

		const category =
			expenseForm.category === "Other"
				? expenseForm.customCategory.trim()
				: expenseForm.category;
		const items = validItems.map((item) => ({
			name: item.name.trim(),
			price: Number(item.price),
		}));
		// expenses.date is a Postgres `date`: the form may hold a printed format
		// from a scanned receipt, so normalise it, but never through toISOString()
		// -- that stores the UTC day, which is the wrong day east of UTC.
		const date = toLocalDate(parseDateOnly(expenseForm.date));
		const description = expenseForm.description.trim() || null;
		const paidBy = showContribution ? expenseForm.paidBy : null;
		const usedBy =
			showContribution && expenseForm.paidBy === null
				? expenseForm.usedBy
				: null;

		// Edit path is optimistic like the add path: apply the new values locally
		// and dismiss immediately, then persist + reconcile in the background.
		if (editingExpenseId) {
			const editingId = editingExpenseId;
			const original = profileExpenses.find((e) => e.id === editingId);
			const editedAt = new Date().toISOString();
			const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
			setProfileExpenses((current) =>
				current.map((e) =>
					e.id === editingId
						? {
								...e,
								category,
								date,
								description,
								paid_by: paidBy,
								used_by: usedBy,
								price: totalPrice,
								items: items.map((item, index) => ({
									id: `${editingId}-item-${index}`,
									expense_id: editingId,
									created_at: editedAt,
									name: item.name,
									price: item.price,
								})),
							}
						: e,
				),
			);
			setExpenseForm(defaultExpenseForm());
			setEditingExpenseId(null);
			setShowExpenseComposer(false);

			try {
				await expenseApi.updateExpense(
					editingId,
					{
						category,
						date,
						description,
						paid_by: paidBy,
						used_by: usedBy,
					} as any,
					items,
				);
				await refreshProfileData(activeProfile.id, true);
			} catch (error) {
				// Roll back the optimistic edit and surface the failure.
				if (original) {
					setProfileExpenses((current) =>
						current.map((e) => (e.id === editingId ? original : e)),
					);
				}
				setEditingExpenseId(editingId);
				setExpenseForm(expenseDraft);
				setShowExpenseComposer(true);
				announce(extractError(error));
			}
			return;
		}

		// Add path is optimistic: show the new entry and dismiss the composer
		// immediately, then persist + reconcile in the background. This keeps the
		// save feeling instant instead of waiting on the insert + full refresh.
		const now = new Date().toISOString();
		const tempId = `temp-${now}-${Math.random().toString(36).slice(2)}`;
		const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
		const expenseInput = {
			added_by: session.user.id,
			category,
			date,
			description,
			is_borrow: expenseForm.is_borrow,
			items,
			paid_by: paidBy,
			plan_id: selectedPlan.id,
			profile_id: selectedPlan.profile_id,
			used_by: usedBy,
		};
		const optimisticExpense: ExpenseWithItems = {
			...expenseInput,
			id: tempId,
			created_at: now,
			price: totalPrice,
			items: items.map((item, index) => ({
				id: `${tempId}-item-${index}`,
				expense_id: tempId,
				created_at: now,
				name: item.name,
				price: item.price,
			})),
		};
		const itemNames = items.map((i) => i.name).join(", ");

		setProfileExpenses((current) => [optimisticExpense, ...current]);
		setExpenseForm(defaultExpenseForm());
		setEditingExpenseId(null);
		setShowExpenseComposer(false);

		try {
			await expenseApi.addExpense(expenseInput);
			await notifyOtherMembers(
				`${userProfile?.name ?? "A member"} added ${itemNames} to ${selectedPlan.name}.`,
				notificationTypes.expense,
			);
			// Reconcile: the refresh replaces the temp entry with the real persisted one.
			await refreshProfileData(activeProfile.id, true);
		} catch (error) {
			// Roll back the optimistic entry and surface the failure.
			setProfileExpenses((current) => current.filter((e) => e.id !== tempId));
			setExpenseForm(expenseDraft);
			setShowExpenseComposer(true);
			announce(extractError(error));
		}
	};

	const handleReceiptScanConfirm = (receipt: ParsedReceipt) => {
		if (!selectedPlan) {
			announce("Choose a budget plan before scanning a bill.");
			return;
		}
		const mappedCategory = categoryForReceiptVendor(receipt.vendor);
		const isKnownCategory = expenseCategories.some(
			(category) => category.key === mappedCategory && category.key !== "Other",
		);
		const itemDrafts = receipt.items.map((item) => ({
			name: formatReceiptItemName(item),
			price: String(item.totalPrice),
		}));
		setEditingExpenseId(null);
		setExpenseForm({
			...defaultExpenseForm(),
			category: isKnownCategory ? mappedCategory : "Other",
			customCategory: isKnownCategory
				? ""
				: receipt.vendor ?? "Scanned receipt",
			date: receipt.date ?? todayLocalDate(),
			description: receipt.vendor ? `Receipt · ${receipt.vendor}` : "Scanned receipt",
			items: itemDrafts.length > 0 ? itemDrafts : [{ name: "", price: "" }],
		});
		setShowReceiptScanner(false);
		// Let the scanner modal close before showing the normal expense composer.
		requestAnimationFrame(() => setShowExpenseComposer(true));
	};

	const startEditBorrow = (expense: ExpenseWithItems) => {
		const items = expense.items ?? [];
		const totalAmount = items.reduce(
			(sum, item) => sum + Number(item.price),
			0,
		);
		setBorrowForm({
			amount: String(Math.abs(totalAmount)),
			date: expense.date,
			description: expense.description || "",
		});
		setEditingBorrowId(expense.id);
		setShowBorrowComposer(true);
	};

	const handleBorrow = async () => {
		if (!session?.user || !activeProfile || !selectedPlan) return;
		const amount = Number(borrowForm.amount);
		if (!amount || amount <= 0) {
			announce("Enter a valid amount to borrow.");
			return;
		}

		await runAction(async () => {
			const borrowDate = toLocalDate(parseDateOnly(borrowForm.date));
			const borrowDescription = borrowForm.description.trim() || null;
			const borrowItem = {
				name: borrowForm.description.trim() || "Borrowed from budget",
				price: amount,
			};
			if (editingBorrowId) {
				const editingId = editingBorrowId;
				await expenseApi.updateExpense(
					editingId,
					{ date: borrowDate, description: borrowDescription },
					[borrowItem],
				);
				setProfileExpenses((prev) =>
					prev.map((e) =>
						e.id === editingId
							? {
									...e,
									date: borrowDate,
									description: borrowDescription,
									price: amount,
									items: [
										{
											id: `${editingId}-item-0`,
											expense_id: editingId,
											created_at: borrowDate,
											name: borrowItem.name,
											price: amount,
										},
									],
								}
							: e,
					),
				);
				setEditingBorrowId(null);
			} else {
				const saved = await expenseApi.addExpense({
					added_by: session.user.id,
					category: "Borrow",
					date: borrowDate,
					description: borrowDescription,
					is_borrow: true,
					items: [borrowItem],
					paid_by: null,
					plan_id: selectedPlan.id,
					profile_id: selectedPlan.profile_id,
					used_by: session.user.id,
				});
				setProfileExpenses((prev) => [
					{
						...saved,
						items: [
							{
								id: `${saved.id}-item-0`,
								expense_id: saved.id,
								created_at: saved.created_at,
								name: borrowItem.name,
								price: amount,
							},
						],
					},
					...prev,
				]);
			}
			setBorrowForm({
				amount: "",
				date: todayLocalDate(),
				description: "",
			});
			setShowBorrowComposer(false);
			void refreshProfileData(activeProfile.id, true);
		});
	};

	const handleRepay = async () => {
		if (!session?.user || !activeProfile || !selectedPlan) return;
		const amount = Number(repayForm.amount);
		if (!amount || amount <= 0) {
			announce("Enter a valid amount to repay.");
			return;
		}

		await runAction(async () => {
			const saved = await expenseApi.addExpense({
				added_by: session.user.id,
				category: "Repay",
				date: repayForm.date,
				description: "Repayment to budget",
				is_borrow: true,
				items: [{ name: "Repayment to budget", price: -amount }],
				paid_by: null,
				plan_id: selectedPlan.id,
				profile_id: selectedPlan.profile_id,
				used_by: session.user.id,
			});
			setProfileExpenses((prev) => [
				{
					...saved,
					items: [
						{
							id: `${saved.id}-item-0`,
							expense_id: saved.id,
							created_at: saved.created_at,
							name: "Repayment to budget",
							price: -amount,
						},
					],
				},
				...prev,
			]);
			setRepayForm({
				amount: "",
				borrowId: "",
				date: todayLocalDate(),
			});
			setShowRepayComposer(false);
			void refreshProfileData(activeProfile.id, true);
		});
	};

	const addExpenseItem = () => {
		setActiveExpenseItemSuggestionIndex(null);
		setExpenseForm((current) => ({
			...current,
			items: [...current.items, { name: "", price: "" }],
		}));
	};

	const removeExpenseItem = (index: number) => {
		if (expenseForm.items.length > 1) {
			setActiveExpenseItemSuggestionIndex(null);
			setExpenseForm((current) => ({
				...current,
				items: current.items.filter((_, i) => i !== index),
			}));
		}
	};

	const updateExpenseItem = (
		index: number,
		field: "name" | "price",
		value: string,
	) => {
		setActiveExpenseItemSuggestionIndex(
			field === "name" && value.trim() ? index : null,
		);
		setExpenseForm((current) => ({
			...current,
			items: current.items.map((item, i) =>
				i === index ? { ...item, [field]: value } : item,
			),
		}));
	};

	const expenseTotal = expenseForm.items.reduce((sum, item) => {
		const price = parseFloat(item.price);
		return sum + (isNaN(price) ? 0 : price);
	}, 0);

	const startEditExpense = (expense: ExpenseWithItems) => {
		setEditingExpenseId(expense.id);
		const form = {
			category:
				expenseCategories.find((c) => c.key === expense.category)?.key ??
				"Other",
			customCategory: expenseCategories.find((c) => c.key === expense.category)
				? ""
				: expense.category,
			date: expense.date.slice(0, 10),
			description: expense.description || "",
			items:
				expense.items?.length > 0
					? expense.items.map((item) => ({
							name: item.name,
							price: String(item.price),
						}))
					: [{ name: "", price: "" }],
			is_borrow: expense.is_borrow,
			paidBy: expense.paid_by,
			usedBy: expense.used_by,
		};
		originalExpenseForm.current = form;
		setExpenseForm(form);
		requestAnimationFrame(() => {
			setShowExpenseComposer(true);
		});
	};

	const applyRecentItemSuggestion = (
		index: number,
		suggestion: RecentExpenseItemSuggestion,
	) => {
		setActiveExpenseItemSuggestionIndex(null);
		setExpenseForm((current) =>
			applyRecentItemSuggestionToExpenseForm(current, index, suggestion),
		);
	};

	const handleDeleteExpense = async (
		expenseId: string,
		expenseTitle: string,
	) => {
		if (!activeProfile) {
			announce("No active profile selected.");
			return;
		}

		showConfirm({
			body: `Are you sure you want to delete "${expenseTitle}"?`,
			confirmText: "Delete",
			destructive: true,
			onConfirm: () => {
				runAction(async () => {
					await expenseApi.deleteExpense(expenseId);
					setProfileExpenses((prev) => prev.filter((e) => e.id !== expenseId));
					void refreshProfileData(activeProfile.id, true);
				});
			},
			title: "Delete Expense",
		});
	};

	const handleAddShoppingItem = async () => {
		if (!session?.user || !activeProfile) {
			return;
		}

		if (!shoppingForm.name.trim()) {
			announce("Add the product name first.");
			return;
		}

		await runAction(async () => {
			const created = await shoppingApi.addItem({
				added_by: session.user.id,
				category: shoppingForm.category || null,
				name: shoppingForm.name.trim(),
				profile_id: activeProfile.id,
				quantity: shoppingForm.quantity || null,
			});
			setShoppingItems((prev) => [created, ...prev]);

			await notifyOtherMembers(
				`${userProfile?.name ?? "A member"} added ${shoppingForm.name} to the shopping list.`,
				notificationTypes.shoppingAdded,
			);
			setShoppingForm(defaultShoppingForm);
			setShowShoppingComposer(false);
			void refreshProfileData(activeProfile.id, true);
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
					setProfileExpenses((prev) =>
						prev.filter((e) => e.id !== item.linked_expense_id),
					);
				}
				const updated = await shoppingApi.markUnbought(item.id);
				setShoppingItems((prev) =>
					prev.map((i) => (i.id === updated.id ? updated : i)),
				);
				void refreshProfileData(activeProfile.id, true);
			});
		} else {
			setPendingBoughtItem(item);
			setBoughtForm({ price: "", paidBy: null, planId: "" });
			setShowBoughtComposer(true);
		}
	};

	const handleConfirmBought = async () => {
		if (!session?.user || !activeProfile || !pendingBoughtItem) return;

		await runAction(async () => {
			if (!boughtForm.planId) {
				const updated = await shoppingApi.markBought(
					pendingBoughtItem.id,
					session.user.id,
				);
				setShoppingItems((prev) =>
					prev.map((i) => (i.id === updated.id ? updated : i)),
				);
				await notifyOtherMembers(
					`${userProfile?.name ?? "A member"} marked ${pendingBoughtItem.name} as bought.`,
					notificationTypes.shoppingBought,
				);
			} else {
				const price = Number(boughtForm.price);
				if (!price || price <= 0) {
					throw new Error("Enter a valid price.");
				}

				const plan = plans.find((p) => p.id === boughtForm.planId);
				if (!plan) {
					throw new Error("Budget plan not found.");
				}

				const itemDescription = pendingBoughtItem.quantity
					? `${pendingBoughtItem.name} (Qty: ${pendingBoughtItem.quantity})`
					: pendingBoughtItem.name;

				const newExpense = await expenseApi.addExpense(
					{
						added_by: session.user.id,
						category: pendingBoughtItem.category || "Groceries",
					date: todayLocalDate(),
					description: pendingBoughtItem.category || null,
						is_borrow: false,
						items: [{ name: itemDescription, price }],
						paid_by: boughtForm.paidBy,
					plan_id: boughtForm.planId,
					profile_id: activeProfile.id,
						used_by: boughtForm.paidBy,
					},
					"id",
				);

				const updated = await shoppingApi.markBought(
					pendingBoughtItem.id,
					session.user.id,
					newExpense.id,
				);
				setShoppingItems((prev) =>
					prev.map((i) => (i.id === updated.id ? updated : i)),
				);
					const boughtAt = new Date().toISOString();
					const boughtDay = todayLocalDate();
					setProfileExpenses((prev) => [
					{
						id: newExpense.id,
						plan_id: boughtForm.planId,
						profile_id: activeProfile.id,
						description: pendingBoughtItem.category || null,
						category: pendingBoughtItem.category || "Groceries",
						price,
						date: boughtDay,
						created_at: boughtAt,
						added_by: session.user.id,
						paid_by: boughtForm.paidBy,
						used_by: boughtForm.paidBy,
						is_borrow: false,
						items: [
							{
								id: `${newExpense.id}-item-0`,
								expense_id: newExpense.id,
								created_at: boughtAt,
								name: itemDescription,
								price,
							},
						],
					},
					...prev,
				]);
				await notifyOtherMembers(
					`${userProfile?.name ?? "A member"} bought ${pendingBoughtItem.name} for ${c(price)} ✓`,
					notificationTypes.shoppingBought,
				);
			}

			setShowBoughtComposer(false);
			setPendingBoughtItem(null);
			setBoughtForm({ price: "", paidBy: null, planId: "" });
			void refreshProfileData(activeProfile.id, true);
		});
	};

	const handleDeleteShoppingItem = async (itemId: string, itemName: string) => {
		if (!activeProfile) {
			announce("No active profile selected.");
			return;
		}

		showConfirm({
			body: `Are you sure you want to delete "${itemName}"?`,
			confirmText: "Delete",
			destructive: true,
			onConfirm: () => {
				runAction(async () => {
					await shoppingApi.deleteItem(itemId);
					setShoppingItems((prev) => prev.filter((i) => i.id !== itemId));
					void refreshProfileData(activeProfile.id, true);
				});
			},
			title: "Delete Item",
		});
	};

	const handleSendInvite = async () => {
		if (!session || !activeProfile || !inviteEmail.trim()) {
			announce("Add the member email first.");
			return;
		}

		await runAction(async () => {
			const result = await inviteApi.sendInvite(validateSession(session), {
				invited_email: inviteEmail.trim(),
				inviter_name: userProfile?.name ?? "A member",
				profile_id: activeProfile.id,
				profile_name: activeProfile.name,
			});

			setLastInviteLink(result.shareable_link);
			setInviteEmail("");
			announce(
				result.email_delivered
					? "Invitation email sent. You can also copy or share the invite link."
					: "Invite created, but email delivery failed. Share the invite link manually.",
			);
		});
	};

	const acceptInviteFlow = useCallback(
		async (token: string) => {
			if (!session) {
				return;
			}

			await runAction(async () => {
				const result = await inviteApi.acceptInvite(
					validateSession(session),
					token,
				);
				const nextProfiles = await profileApi.fetchAccessibleProfiles(
					session.user.id,
				);
				setProfiles(nextProfiles);
				setActiveProfileId(result.profile_id);
				setPendingInviteToken(null);
				setShowProfileSwitcher(false);
				announce("Invitation accepted. Welcome to the shared home.");
			});
		},
		[announce, runAction, session],
	);

	useEffect(() => {
		if (!session || !pendingInviteToken || showOnboarding) {
			return;
		}

		acceptInviteFlow(pendingInviteToken);
	}, [acceptInviteFlow, pendingInviteToken, session, showOnboarding]);

	const handleSaveSettings = async () => {
		if (!session?.user || !activeProfile) {
			return;
		}

		await runAction(async () => {
			// Both writes touch unrelated rows, so they share one round trip, and
			// their returned rows replace the follow-up refetch pair.
			const [nextUserProfile, updatedHousehold] = await Promise.all([
				profileApi.upsertUserProfile(session.user, {
					avatarEmoji: profileForm.avatarEmoji,
					currency: profileForm.currency,
					name: profileForm.name,
				}),
				profileApi.updateHousehold(activeProfile.id, {
					emoji_avatar: profileForm.familyEmoji,
					name: profileForm.familyName,
					space_type: (profileForm.spaceType as SpaceType) ?? "personal",
				}),
			]);
			setUserProfile(nextUserProfile);
			setProfiles((prev) =>
				prev.map((p) =>
					p.id === updatedHousehold.id ? { ...p, ...updatedHousehold } : p,
				),
			);
			setShowProfileSettings(false);
		});
	};

	const primeSettingsForm = () => {
		setProfileForm({
			avatarEmoji: userProfile?.avatar_emoji ?? avatarChoices[0]!,
			currency: userProfile?.currency ?? "USD",
			familyEmoji: activeProfile?.emoji_avatar ?? avatarChoices[1]!,
			familyName: activeProfile?.name ?? "",
			name: userProfile?.name ?? "",
			spaceType: activeProfile?.space_type ?? "personal",
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

		if (Platform.OS === "web") {
			const confirmed = globalThis.confirm?.(
				"Are you sure you want to delete this space? All data will be permanently removed.",
			);
			if (!confirmed) {
				return;
			}
			performDelete();
		} else {
			showConfirm({
				body: "Are you sure you want to delete this space? All data will be permanently removed.",
				confirmText: "Delete",
				destructive: true,
				onConfirm: performDelete,
				title: "Delete Space",
			});
		}
	};

	const handleSaveSpaceType = async () => {
		if (!activeProfileId) return;
		await runAction(async () => {
			const updatedHousehold = await profileApi.updateHousehold(
				activeProfileId,
				{ space_type: migrationSpaceType },
			);
			setProfiles((prev) =>
				prev.map((profile) =>
					profile.id === activeProfileId
						? { ...profile, ...updatedHousehold }
						: profile,
				),
			);
			setMigrationCardVisible(false);
		});
	};

	const handleClearBought = () => runAction(async () => {
		if (!activeProfile) return;
		await shoppingApi.clearBought(activeProfile.id);
		setShoppingItems((prev) => prev.filter((item) => !item.is_bought));
		void refreshProfileData(activeProfile.id);
	});

	const visibleExpenseCategories = showMoreExpenseCategories ||
		expenseCategories.slice(0, 4).some(({ key }) => key === expenseForm.category)
		? expenseCategories
		: expenseCategories.slice(0, 4);
	if (!isConfigReady) {
		return (
			<CenteredState
				body="The app connection is not set up yet. Please check your app configuration."
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
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					style={styles.screen}
				>
					<ScrollView
						automaticallyAdjustKeyboardInsets
						contentContainerStyle={[
							styles.authWrap,
							{ paddingBottom: Math.max(24, insets.bottom + 24) },
						]}
						keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
					>
					<BentoCard tone="highlight" style={styles.authCard}>
						<Text style={styles.kicker}>NestLedger</Text>
						<Text style={styles.heroTitle}>
							Shared home budgeting without the chaos.
						</Text>
						<Text style={styles.bodyMuted}>
							Sign in with your email to manage budgets, expenses, shopping
							lists, and invites in real time.
						</Text>

						{pendingInviteToken ? (
							<View style={styles.inlineBanner}>
								<Ionicons
									color={theme.primary}
									name="mail-open-outline"
									size={18}
								/>
								<Text style={styles.inlineBannerText}>
									Sign in first to accept your invitation.
								</Text>
							</View>
						) : null}

						<View style={styles.segmentRow}>
							{(["signin", "signup"] as const).map((mode) => (
								<CategoryChip
									key={mode}
									active={authMode === mode}
									label={mode === "signin" ? "Sign in" : "Register"}
									onPress={() => setAuthMode(mode)}
									testID={`auth-mode-${mode}`}
								/>
							))}
						</View>

						<LabeledInput
							autoCapitalize="none"
							autoComplete="email"
							inputMode="email"
							label="Email"
							spellCheck={false}
							onChangeText={(value) =>
								setAuthForm((current) => ({ ...current, email: value }))
							}
							onSubmitEditing={() => authPasswordInputRef.current?.focus()}
							returnKeyType="next"
							submitBehavior="submit"
							testID="auth-email-input"
							value={authForm.email}
						/>
						<PasswordInput
							autoComplete={authMode === "signin" ? "current-password" : "new-password"}
							label="Password"
							onChangeText={(value) =>
								setAuthForm((current) => ({ ...current, password: value }))
							}
							testID="auth-password-input"
							toggleTestID="auth-password-visibility-toggle"
							ref={authPasswordInputRef}
							returnKeyType="done"
							value={authForm.password}
						/>

						{authMessage ? (
							<Text accessibilityRole="alert" style={styles.errorText}>{authMessage}</Text>
						) : null}

						<ModernButton
							loading={authBusy}
							onPress={handleAuth}
							testID="auth-submit-button"
							text={authMode === "signin" ? "Continue" : "Create account"}
						/>
		{authMode === "signin" ? (
							<Pressable accessibilityRole="button" onPress={() => void handlePasswordReset()} style={styles.authRecoveryButton}>
								<Text style={styles.authRecoveryText}>{resetCodeSent ? "Send another code" : "Forgot password?"}</Text>
							</Pressable>
						) : null}
						<Text style={styles.footnote}>
							New accounts need to confirm their email before signing in.
						</Text>
					</BentoCard>
					</ScrollView>
				</KeyboardAvoidingView>
			</SafeAreaView>
		);
	}

	if (session && (!profileLoaded || !onboardingLoaded)) {
		return <SplashScreen />;
	}

	if (showOnboarding) {
		return (
			<OnboardingCarousel
				onComplete={completeOnboarding}
				onSkip={completeOnboarding}
				primaryActionText={onboardingPrimaryActionText}
			/>
		);
	}

	if (!userProfile || profiles.length === 0 || showCreateProfile) {
		const isFirstSetup = !userProfile || profiles.length === 0;

		if (profileSetupStep === "type") {
			return (
				<SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
					<ScrollView
						contentContainerStyle={styles.authWrap}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
					>
						<BentoCard tone="highlight" style={styles.authCard}>
							<Text style={styles.kicker}>
								{isFirstSetup ? "Welcome to NestLedger" : "New space"}
							</Text>
							<Text style={styles.heroTitle}>
								What would you like to track?
							</Text>
							<Text style={styles.bodyMuted}>
								Choose a space type — you can always change it later in
								settings.
							</Text>
							<View style={styles.spaceTypeGrid}>
								{SPACE_TYPES.map((st) => {
									const selected = profileForm.spaceType === st.type;
									return (
										<Pressable
											key={st.type}
											onPress={() =>
												setProfileForm({ ...profileForm, spaceType: st.type })
											}
											style={[
												styles.spaceTypeCard,
												selected && styles.spaceTypeCardActive,
											]}
										>
											<Text style={styles.spaceTypeEmoji}>{st.emoji}</Text>
											<Text
												style={[
													styles.spaceTypeLabel,
													selected && styles.spaceTypeLabelActive,
												]}
											>
												{st.label}
											</Text>
											<Text
												style={[
													styles.spaceTypeDesc,
													selected && styles.spaceTypeDescActive,
												]}
											>
												{st.desc}
											</Text>
										</Pressable>
									);
								})}
							</View>
							<ModernButton
								onPress={() => setProfileSetupStep("details")}
								testID="space-type-next"
								text="Continue →"
							/>
							{!isFirstSetup ? (
								<ModernButton
									onPress={() => setShowCreateProfile(false)}
									secondary
									testID="create-profile-cancel"
									text="Cancel"
								/>
							) : null}
						</BentoCard>
					</ScrollView>
				</SafeAreaView>
			);
		}

		return (
			<SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
				<ScrollView
					contentContainerStyle={styles.authWrap}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
				>
					<BentoCard tone="highlight" style={styles.authCard}>
						<Pressable
							onPress={() => setProfileSetupStep("type")}
							style={styles.backRow}
						>
							<Ionicons color={theme.primary} name="chevron-back" size={18} />
							<Text style={styles.backRowText}>Change type</Text>
						</Pressable>
						<Text style={styles.kicker}>
							{isFirstSetup ? "Set up your space" : "Create new space"}
						</Text>
						<Text style={styles.heroTitle}>
							{SPACE_TYPES.find((s) => s.type === profileForm.spaceType)?.emoji}{" "}
							{SPACE_TYPES.find((s) => s.type === profileForm.spaceType)?.label}
						</Text>
						<ProfileFormFields form={profileForm} onChange={setProfileForm} />
						{setupMessage ? (
							<Text style={styles.errorText}>{setupMessage}</Text>
						) : null}
						<ModernButton
							loading={actionBusy}
							onPress={handleCreateProfile}
							testID="create-profile-submit"
							text={isFirstSetup ? "Create space" : "Create space"}
						/>
						{!isFirstSetup ? (
							<ModernButton
								onPress={() => setShowCreateProfile(false)}
								secondary
								testID="create-profile-cancel"
								text="Cancel"
							/>
						) : null}
					</BentoCard>
				</ScrollView>
			</SafeAreaView>
		);
	}

	if (!activeProfile || showProfileSwitcher) {
		return (
			<SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
				<ScrollView
					contentContainerStyle={styles.switcherWrap}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
				>
					<View style={styles.switcherHeader}>
						<Text style={styles.kicker}>Choose profile</Text>
						<Text style={styles.sectionTitle}>Your spaces</Text>
						<Text style={styles.bodyMuted}>
							All budget spaces you’re part of appear here.
						</Text>
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
							<Text style={styles.switcherEmoji}>
								{profile.emoji_avatar ?? "🏡"}
							</Text>
							<View style={{ flex: 1 }}>
								<Text style={styles.cardTitle}>{profile.name}</Text>
								<Text style={styles.bodyMuted}>
									{spaceTypeName(profile.space_type)} •{" "}
									{formatShortDate(profile.created_at)} • Hold to delete
								</Text>
							</View>
							<Ionicons
								color={theme.primary}
								name="chevron-forward"
								size={20}
							/>
						</Pressable>
					))}

					<ModernButton
						onPress={() => {
							setProfileSetupStep("type");
							setProfileForm({ ...defaultCreateProfileForm, currency: userProfile?.currency ?? "USD" });
							setShowCreateProfile(true);
						}}
						secondary
						testID="profile-switcher-create"
						text="Create another space"
					/>
					<ModernButton
						onPress={handleSignOut}
						secondary
						testID="profile-switcher-signout"
						text="Sign out"
					/>
				</ScrollView>
			</SafeAreaView>
		);
	}

	return (
		<GestureHandlerRootView
			style={[styles.screen, { backgroundColor: theme.background }]}
		>
			<SafeAreaView
				style={[
					styles.screen,
					{ paddingTop: insets.top, backgroundColor: theme.background },
				]}
			>
				<KeyboardAvoidingView
					behavior={Platform.select({ ios: "padding", android: "height", default: undefined })}
					style={styles.screen}
				>
					<View
						style={[
							styles.appShell,
							{
								paddingBottom: Math.max(16, insets.bottom),
								backgroundColor: theme.background,
							},
						]}
					>
						<View style={styles.topBar}>
							<Pressable
								hitSlop={10}
								onPress={() => setShowProfileSwitcher(true)}
								style={styles.profileSwitcherButton}
								testID="open-profile-switcher"
							>
								<Text style={styles.switcherEmoji}>
									{activeProfile.emoji_avatar ?? "🏡"}
								</Text>
								<View>
									<Text style={styles.topBarTitle}>{activeProfile.name}</Text>
									<Text style={styles.topBarSubtitle}>
										{userProfile.name} ·{" "}
										{spaceTypeName(activeProfile.space_type)}
									</Text>
								</View>
								<Ionicons
									color={theme.textMuted}
									name="chevron-down"
									size={16}
								/>
							</Pressable>

											<Pressable
								accessibilityRole="button"
								accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
								hitSlop={10}
								onPress={() => setShowNotifications(true)}
								style={styles.bellButton}
								testID="open-notifications"
							>
								<Ionicons
									color={theme.text}
									name="notifications-outline"
									size={22}
								/>
								{unreadCount > 0 ? (
									<View style={styles.badge}>
										<Text style={styles.badgeText}>
											{Math.min(unreadCount, 9)}
										</Text>
									</View>
								) : null}
							</Pressable>
						</View>

						{busy ? (
							<View style={styles.loaderWrap}>
								<ActivityIndicator color={theme.primary} size="large" />
							</View>
						) : (
							<ScrollView
								contentContainerStyle={styles.contentWrap}
								keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
								keyboardShouldPersistTaps="handled"
								nestedScrollEnabled
								showsVerticalScrollIndicator={false}
							>
								{setupMessage ? (
									<View style={styles.inlineBanner}>
										<Ionicons
											color={theme.secondary}
											name="warning-outline"
											size={18}
										/>
										<Text style={styles.inlineBannerText}>{setupMessage}</Text>
									</View>
								) : null}

								{activeTab === "dashboard" ? (
									<DashboardTab
										activeBudget={plans[0]}
										spent={plans[0] ? currentMonthStatsMap[plans[0].id]?.spent ?? 0 : 0}
										shoppingItems={shoppingItems}
										shoppingBadgeCount={shoppingBadgeCount}
										memberCount={members.length}
										unreadCount={unreadCount}
										savingsTrackerCount={savingsTrackers.length}
										currentMonthSavingsStatsMap={currentMonthSavingsStatsMap}
										latestActivities={notifications.slice(0, 4)}
										isTablet={isTablet}
										bentoWidth={bentoWidth}
										c={c}
										migrationCardVisible={migrationCardVisible}
										migrationSpaceType={migrationSpaceType}
										actionBusy={actionBusy}
										onCreateBudget={() => setShowBudgetComposer(true)}
										onAnalyse={() => setShowAnalyse(true)}
										onNotifications={() => setShowNotifications(true)}
										onMigrationSpaceTypeChange={setMigrationSpaceType}
										onSaveMigration={handleSaveSpaceType}
										onDismissMigration={() => setMigrationCardVisible(false)}
									/>
								) : null}

								{activeTab === "budget" ? (
									<BudgetTab
										plans={plans}
										billTrackers={billTrackers}
										savingsTrackers={savingsTrackers}
										currentMonthStatsMap={currentMonthStatsMap}
										currentMonthBillStatsMap={currentMonthBillStatsMap}
										currentMonthSavingsStatsMap={currentMonthSavingsStatsMap}
										budgetEditMode={budgetEditMode}
										c={c}
										onToggleEditMode={() => setBudgetEditMode(!budgetEditMode)}
										onNewPlan={() => {
											setNewPlanType("budget");
											setShowNewPlanComposer(true);
										}}
										onSelectPlan={setSelectedPlanId}
										onEditBudget={handleEditBudget}
										onDeleteBudget={handleDeleteBudget}
										onDeleteTracker={handleDeleteTracker}
										onEditBillTracker={(tracker) => {
											setEditingBillTrackerId(tracker.id);
											setEditBillTrackerForm({ name: tracker.name });
										}}
										onSelectBillTracker={(id) => {
											setBillViewMonth("current");
											setBillTrackerDetailLoading(true);
											setSelectedBillTrackerId(id);
										}}
										onEditSavingsTracker={(tracker) => {
											setEditingSavingsTrackerId(tracker.id);
											setEditSavingsTrackerForm({ name: tracker.name });
										}}
										onSelectSavingsTracker={(id) => {
											setSavingsViewMonth("current");
											setSavingsTrackerDetailLoading(true);
											setSelectedSavingsTrackerId(id);
										}}
									/>
								) : null}

								{activeTab === "shopping" ? (
									<ShoppingTab
										filteredShoppingItems={filteredShoppingItems}
										shoppingFilter={shoppingFilter}
										memberMap={memberMap}
										onAddItem={() => setShowShoppingComposer(true)}
										onFilterChange={setShoppingFilter}
										onClearBought={handleClearBought}
										onDeleteItem={handleDeleteShoppingItem}
										onMarkBought={handleMarkBought}
									/>
								) : null}

								{activeTab === "profile" ? (
									<ProfileTab
										userProfile={userProfile}
										profileName={activeProfile.name}
										reminderBusy={reminderBusy}
										reminderEnabled={reminderEnabled}
										reminderTime={reminderTime}
										onMembers={() => setShowMembers(true)}
										onInvite={() => setShowInvite(true)}
										onSettings={primeSettingsForm}
										onSwitchProfile={() => setShowProfileSwitcher(true)}
										onToggleReminder={toggleReminder}
										onReminderTimeChange={setReminderTime}
										onSaveReminderTime={updateReminderTime}
										onAndroidKeyboardVisibleChange={setAndroidKeyboardVisible}
									/>
								) : null}

							</ScrollView>
						)}

						<View style={[styles.bottomTabs, androidKeyboardVisible && { display: "none" }]}>
							<TabButton
								active={activeTab === "dashboard"}
								badge={0}
								icon="grid-outline"
								label="Dashboard"
								onPress={() => setActiveTab("dashboard")}
								testID="tab-dashboard"
							/>
							<TabButton
								active={activeTab === "budget"}
								badge={0}
								icon="wallet-outline"
								label="Budget"
								onPress={() => setActiveTab("budget")}
								testID="tab-budget"
							/>
							<TabButton
								active={activeTab === "shopping"}
								badge={shoppingBadgeCount}
								icon="cart-outline"
								label="Shopping"
								onPress={() => setActiveTab("shopping")}
								testID="tab-shopping"
							/>
							<TabButton
								active={activeTab === "profile"}
								badge={0}
								icon="person-outline"
								label="Profile"
								onPress={() => setActiveTab("profile")}
								testID="tab-profile"
							/>
						</View>
					</View>
				</KeyboardAvoidingView>

				<ConfirmModal
					body={confirmModal?.body ?? ""}
					confirmText={confirmModal?.confirmText ?? "Confirm"}
					destructive={confirmModal?.destructive ?? false}
					onConfirm={() => {
						confirmModal?.onConfirm();
						closeConfirm();
					}}
					onClose={closeConfirm}
					title={confirmModal?.title ?? ""}
					visible={confirmModal?.visible ?? false}
				/>

				<AnalyseScreen
					visible={showAnalyse}
					profile={activeProfile}
					expenses={profileExpenses}
					plans={plans}
					members={members}
					currency={userCurrency}
					onClose={() => setShowAnalyse(false)}
				/>

				<Modal
					animationType="slide"
					onRequestClose={() => {
						setShowBudgetComposer(false);
						setEditingPlanId(null);
						setBudgetForm(defaultBudgetForm());
					}}
					presentationStyle="pageSheet"
					visible={showBudgetComposer}
				>
					<ModalScaffold
						closeTestID="close-budget-modal"
						onClose={() => {
							setShowBudgetComposer(false);
							setEditingPlanId(null);
							setBudgetForm(defaultBudgetForm());
						}}
						title={editingPlanId ? "Edit Budget Plan" : "Create Budget Plan"}
					>
						<LabeledInput
							label="Plan name"
							onChangeText={(value) =>
								setBudgetForm((current) => ({ ...current, name: value }))
							}
							testID="budget-plan-name-input"
							value={budgetForm.name}
						/>
						<LabeledInput
							keyboardType="numeric"
							label={`Total budget (${userCurrency})`}
							onChangeText={(value) =>
								setBudgetForm((current) => ({ ...current, totalAmount: value }))
							}
							testID="budget-plan-total-input"
							value={budgetForm.totalAmount}
						/>
						<LabeledInput
							label="Start date (YYYY-MM-DD)"
							onChangeText={(value) =>
								setBudgetForm((current) => ({ ...current, startDate: value }))
							}
							testID="budget-plan-start-input"
							value={budgetForm.startDate}
						/>
						<LabeledInput
							label="End date (YYYY-MM-DD)"
							onChangeText={(value) =>
								setBudgetForm((current) => ({ ...current, endDate: value }))
							}
							testID="budget-plan-end-input"
							value={budgetForm.endDate}
						/>
						<ModernButton
							loading={actionBusy}
							onPress={handleCreateBudget}
							testID="budget-save-plan"
							text={editingPlanId ? "Update plan" : "Save plan"}
						/>
					</ModalScaffold>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => {
						setShowNewPlanComposer(false);
						setNewPlanName("");
					}}
					presentationStyle="pageSheet"
					visible={showNewPlanComposer}
				>
					<ModalScaffold
						closeTestID="close-new-plan-modal"
						onClose={() => {
							setShowNewPlanComposer(false);
							setNewPlanName("");
						}}
						title="New plan"
					>
						<View style={styles.segmentRow}>
							<CategoryChip
								active={newPlanType === "budget"}
								label="Budget Plan"
								onPress={() => setNewPlanType("budget")}
							/>
							<CategoryChip
								active={newPlanType === "bill"}
								label="Bill Tracker"
								onPress={() => setNewPlanType("bill")}
							/>
							<CategoryChip
								active={newPlanType === "savings"}
								label="Savings Tracker"
								onPress={() => setNewPlanType("savings")}
							/>
						</View>
						{newPlanType === "budget" ? (
							<>
								<LabeledInput
									label="Plan name"
									onChangeText={(value) =>
										setBudgetForm((current) => ({ ...current, name: value }))
									}
									testID="new-plan-name-input"
									value={budgetForm.name}
								/>
								<LabeledInput
									keyboardType="numeric"
									label={`Total budget (${userCurrency})`}
									onChangeText={(value) =>
										setBudgetForm((current) => ({
											...current,
											totalAmount: value,
										}))
									}
									testID="new-plan-total-input"
									value={budgetForm.totalAmount}
								/>
								<LabeledInput
									label="Start date (YYYY-MM-DD)"
									onChangeText={(value) =>
										setBudgetForm((current) => ({
											...current,
											startDate: value,
										}))
									}
									testID="new-plan-start-input"
									value={budgetForm.startDate}
								/>
								<LabeledInput
									label="End date (YYYY-MM-DD)"
									onChangeText={(value) =>
										setBudgetForm((current) => ({ ...current, endDate: value }))
									}
									testID="new-plan-end-input"
									value={budgetForm.endDate}
								/>
								<ModernButton
									loading={actionBusy}
									onPress={() => {
										setShowNewPlanComposer(false);
										setShowBudgetComposer(true);
									}}
									text="Continue to create"
								/>
							</>
						) : (
							<>
								<LabeledInput
									label="Tracker name"
									onChangeText={setNewPlanName}
									testID="new-tracker-name-input"
									value={newPlanName}
								/>
								<ModernButton
									loading={actionBusy}
									onPress={handleCreateTracker}
									text="Create tracker"
								/>
							</>
						)}
					</ModalScaffold>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => {
						setEditingBillTrackerId(null);
						setEditingSavingsTrackerId(null);
						setEditBillTrackerForm({ name: "" });
						setEditSavingsTrackerForm({ name: "" });
					}}
					presentationStyle="pageSheet"
					visible={
						Boolean(editingBillTrackerId) || Boolean(editingSavingsTrackerId)
					}
				>
					<ModalScaffold
						closeTestID="close-edit-tracker-modal"
						onClose={() => {
							setEditingBillTrackerId(null);
							setEditingSavingsTrackerId(null);
							setEditBillTrackerForm({ name: "" });
							setEditSavingsTrackerForm({ name: "" });
						}}
						title="Edit tracker"
					>
						{editingBillTrackerId ? (
							<>
								<LabeledInput
									label="Tracker name"
									onChangeText={(value) =>
										setEditBillTrackerForm({ name: value })
									}
									testID="edit-bill-tracker-name-input"
									value={editBillTrackerForm.name}
								/>
								<ModernButton
									loading={actionBusy}
									onPress={handleEditTracker}
									text="Save"
								/>
							</>
						) : null}
						{editingSavingsTrackerId ? (
							<>
								<LabeledInput
									label="Tracker name"
									onChangeText={(value) =>
										setEditSavingsTrackerForm({ name: value })
									}
									testID="edit-savings-tracker-name-input"
									value={editSavingsTrackerForm.name}
								/>
								<ModernButton
									loading={actionBusy}
									onPress={handleEditTracker}
									text="Save"
								/>
							</>
						) : null}
					</ModalScaffold>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => setSelectedBillTrackerId(null)}
					presentationStyle="pageSheet"
					visible={Boolean(selectedBillTrackerId)}
				>
					<ModalScaffold
						closeTestID="close-bill-tracker-detail"
						onClose={() => setSelectedBillTrackerId(null)}
						title={
							billTrackers.find((t) => t.id === selectedBillTrackerId)?.name ??
							"Bill Tracker"
						}
					>
						{selectedBillTrackerId ? (
							<>
								<MonthYearSelector
									hasMonthData={(m) =>
										billPayments.some(
											(p) =>
												p.tracker_id === selectedBillTrackerId &&
												p.month === m &&
												p.year === billViewYear,
										)
									}
									onSetMonth={setBillViewMonth}
									onSetYear={(y) => setBillViewYear(y)}
									viewMonth={billViewMonth}
									viewYear={billViewYear}
									years={[
										...new Set(
											billPayments
												.filter((p) => p.tracker_id === selectedBillTrackerId)
												.map((p) => p.year),
										),
									].sort()}
								/>
								{billTrackerDetailLoading ? (
									<View style={styles.centerWrap}>
										<BentoCard tone="highlight" style={styles.centerCard}>
											<ActivityIndicator color={theme.primary} size="large" />
											<Text style={styles.bodyMuted}>
												Loading bill tracker details…
											</Text>
										</BentoCard>
									</View>
								) : (
									<BillTrackerComponent
										currencyCode={userCurrency}
										trackerId={selectedBillTrackerId}
										stats={currentMonthBillStatsMap[selectedBillTrackerId]}
										actionBusy={actionBusy}
										billPayments={billPayments}
										members={members}
										onAddBill={(bill) =>
											handleAddBillToTracker(selectedBillTrackerId, bill)
										}
										onDeleteBill={handleDeleteBillFromTracker}
										onMarkPaid={(payment, paymentName) =>
											handleMarkBillPaid(
												selectedBillTrackerId,
												payment,
												paymentName,
											)
										}
										plans={plans}
										profileId={activeProfile?.id ?? ""}
										recurringBills={recurringBills}
										userId={session?.user?.id ?? ""}
										viewMonth={
											billViewMonth !== "current" ? billViewMonth : undefined
										}
										viewYear={
											billViewMonth !== "current" ? billViewYear : undefined
										}
									/>
								)}
							</>
						) : null}
					</ModalScaffold>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => setSelectedSavingsTrackerId(null)}
					presentationStyle="pageSheet"
					visible={Boolean(selectedSavingsTrackerId)}
				>
					<ModalScaffold
						closeTestID="close-savings-tracker-detail"
						onClose={() => setSelectedSavingsTrackerId(null)}
						title={
							savingsTrackers.find((t) => t.id === selectedSavingsTrackerId)
								?.name ?? "Savings Tracker"
						}
					>
						{selectedSavingsTrackerId ? (
							<>
								<MonthYearSelector
									hasMonthData={(m) =>
										savings.some(
											(e) =>
												e.tracker_id === selectedSavingsTrackerId &&
												parseDateOnly(e.date).getMonth() + 1 === m &&
												parseDateOnly(e.date).getFullYear() === savingsViewYear,
										)
									}
									onSetMonth={setSavingsViewMonth}
									onSetYear={setSavingsViewYear}
									viewMonth={savingsViewMonth}
									viewYear={savingsViewYear}
									years={[
										...new Set(
											savings
												.filter(
													(e) => e.tracker_id === selectedSavingsTrackerId,
												)
												.map((e) => parseDateOnly(e.date).getFullYear()),
										),
									].sort()}
								/>
								{savingsTrackerDetailLoading ? (
									<View style={styles.centerWrap}>
										<BentoCard tone="highlight" style={styles.centerCard}>
											<ActivityIndicator color={theme.primary} size="large" />
											<Text style={styles.bodyMuted}>
												Loading savings tracker details…
											</Text>
										</BentoCard>
									</View>
								) : (
									<SavingsTrackerComponent
										currencyCode={userCurrency}
										trackerId={selectedSavingsTrackerId}
										stats={
											savingsViewMonth === "current"
												? currentMonthSavingsStatsMap[selectedSavingsTrackerId]
												: undefined
										}
										actionBusy={actionBusy}
										members={members}
										onAddDeposit={(entry) =>
											handleAddSaving(selectedSavingsTrackerId, entry)
										}
										onDeleteEntry={handleDeleteSavingEntry}
										onWithdraw={(entry) => {
											if (!activeProfile) return;
											runAction(async () => {
												const saved = await savingsApi.addEntry({
													...entry,
													tracker_id: selectedSavingsTrackerId,
												});
												setSavings((prev) => [saved, ...prev]);
												await notifyOtherMembers(
													`${userProfile?.name ?? "A member"} withdrew ${c(Math.abs(entry.amount))} from savings`,
													notificationTypes.expense,
												);
												void refreshProfileData(activeProfile.id, true);
											});
										}}
										plans={plans}
										profileId={activeProfile?.id ?? ""}
										savings={savings}
										userId={session?.user?.id ?? ""}
										viewMonth={
											savingsViewMonth !== "current"
												? savingsViewMonth
												: undefined
										}
										viewYear={
											savingsViewMonth !== "current"
												? savingsViewYear
												: undefined
										}
									/>
								)}
							</>
						) : null}
					</ModalScaffold>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => setSelectedPlanId(null)}
					presentationStyle="pageSheet"
					visible={Boolean(selectedPlan)}
				>
					<ModalScaffold
						closeTestID="close-budget-detail-modal"
						onClose={() => setSelectedPlanId(null)}
						title={selectedPlan?.name ?? "Budget plan"}
					>
						{selectedPlan ? (
							<>
								<MonthYearSelector
									hasMonthData={(m) => availableViewMonths.includes(m)}
									onSetMonth={setActiveViewMonth}
									onSetYear={setActiveViewYear}
									viewMonth={activeViewMonth}
									viewYear={activeViewYear}
									years={availableViewYears}
								/>

								{isViewingArchive && monthFilteredExpenses ? (
									<>
										<View style={styles.archiveBadge}>
											<Text style={styles.archiveBadgeText}>
												{(() => {
													const { start, end } = getCycleWindowForCursor(
														activeViewYear,
														(activeViewMonth as number) - 1,
														selectedPlanAnchorDay,
													);
													return `Viewing ${formatShortDate(start.toISOString())} – ${formatShortDate(end.toISOString())}`;
												})()}
											</Text>
										</View>

										{(() => {
											const mExpenses = monthFilteredExpenses.filter(
												(e) => !e.is_borrow,
											);
											const mSpent = mExpenses
												.filter((e) => !e.paid_by)
												.reduce((s, e) => s + Number(e.price ?? 0), 0);
											const mContributions = mExpenses
												.filter((e) => e.paid_by)
												.reduce((s, e) => s + Number(e.price ?? 0), 0);
											const mBorrowed = monthFilteredExpenses
												.filter((e) => e.is_borrow && e.price > 0)
												.reduce((s, e) => s + Number(e.price ?? 0), 0);
											const mRepaid = monthFilteredExpenses
												.filter((e) => e.is_borrow && e.price < 0)
												.reduce(
													(s, e) => s + Math.abs(Number(e.price ?? 0)),
													0,
												);
											const mTotalSpent =
												mSpent + mContributions + mBorrowed - mRepaid;
											const mAllocated =
												selectedPlan.total_amount + mContributions;
											const mRemaining = Math.max(mAllocated - mTotalSpent, 0);

											const mMemberBalances: Record<
												string,
												{
													avatar: string;
													borrowed: number;
													contributed: number;
													name: string;
													owes: number;
													repaid: number;
												}
											> = {};
											monthFilteredExpenses.forEach((e) => {
												if (!e.is_borrow) return;
												const userId = e.used_by ?? e.added_by;
												const member = memberMap.get(userId);
												if (!member) return;
												if (!mMemberBalances[userId])
													mMemberBalances[userId] = {
														...member,
														borrowed: 0,
														contributed: 0,
														owes: 0,
														repaid: 0,
													};
												if (e.price > 0)
													mMemberBalances[userId].borrowed += e.price;
												else
													mMemberBalances[userId].repaid += Math.abs(e.price);
											});
											mExpenses
												.filter((e) => e.paid_by)
												.forEach((e) => {
													const member = memberMap.get(e.paid_by!);
													if (!member) return;
													if (!mMemberBalances[e.paid_by!])
														mMemberBalances[e.paid_by!] = {
															...member,
															borrowed: 0,
															contributed: 0,
															owes: 0,
															repaid: 0,
														};
													mMemberBalances[e.paid_by!]!.contributed += Number(
														e.price ?? 0,
													);
												});
											Object.values(mMemberBalances).forEach((bal) => {
												bal.owes = Math.max(
													bal.borrowed - bal.repaid - bal.contributed,
													0,
												);
											});

											return (
												<>
													<BentoCard tone="highlight">
														<Text style={styles.kicker}>
															{selectedPlan.name}
														</Text>
														<Text style={styles.metricText}>
															{c(selectedPlan.total_amount)}
														</Text>
														<Text style={styles.bodyMuted}>
															{formatShortDate(selectedPlan.start_date)} →{" "}
															{formatShortDate(selectedPlan.end_date)}
														</Text>
													</BentoCard>

													<BentoCard>
														<Text style={styles.kicker}>This period</Text>
														<View style={styles.spacer12} />
														<ProgressBar
															progress={mTotalSpent / Math.max(mAllocated, 1)}
														/>
														<View style={styles.spacer12} />
														<View style={styles.cycleStatsRow}>
															<View style={styles.cycleStat}>
																<Text style={styles.cycleStatValue}>
																	{c(mTotalSpent)}
																</Text>
																<Text style={styles.cycleStatLabel}>Spent</Text>
															</View>
															<View style={styles.cycleStatDivider} />
															<View
																style={[
																	styles.cycleStat,
																	{ alignItems: "flex-end" },
																]}
															>
																<Text
																	style={[
																		styles.cycleStatValue,
																		{
																			color:
																				mRemaining > 0
																					? theme.success
																					: theme.danger,
																		},
																	]}
																>
																	{c(mRemaining)}
																</Text>
																<Text style={styles.cycleStatLabel}>
																	Remaining
																</Text>
															</View>
														</View>
														{showContribution ? (
															<Pressable
																onPress={() =>
																	setShowBreakdownDetails((v) => !v)
																}
																style={styles.detailsToggle}
															>
																<Text style={styles.detailsToggleText}>
																	{showBreakdownDetails
																		? "Hide details ▴"
																		: "Details ▾"}
																</Text>
															</Pressable>
														) : null}
													</BentoCard>

													{showContribution && showBreakdownDetails ? (
														<View style={styles.sectionGap}>
															<Text style={styles.inputLabel}>
																Spending Breakdown
															</Text>
															<View style={styles.statRow}>
																<InfoPill
																	label="Plan Budget"
																	value={c(selectedPlan.total_amount)}
																/>
																{mContributions > 0 ? (
																	<InfoPill
																		label="+ Contributions"
																		value={c(mContributions)}
																	/>
																) : null}
																<InfoPill
																	label="= Allocated"
																	value={c(mAllocated)}
																/>
																<InfoPill
																	label="- Expenses"
																	value={c(mSpent)}
																/>
																{mContributions > 0 ? (
																	<InfoPill
																		label="- Own-pocket spent"
																		value={c(mContributions)}
																	/>
																) : null}
																{mBorrowed > 0 ? (
																	<InfoPill
																		label="- Borrowed"
																		value={c(mBorrowed)}
																	/>
																) : null}
																{mRepaid > 0 ? (
																	<InfoPill
																		label="+ Repaid"
																		value={c(mRepaid)}
																	/>
																) : null}
																<InfoPill
																	label="= Remaining"
																	value={c(mRemaining)}
																/>
															</View>
															{Object.keys(mMemberBalances).length > 0 ? (
																<View style={styles.statRow}>
																	{Object.values(mMemberBalances).map((bal) => (
																		<InfoPill
																			key={bal.name}
																			label={`${bal.avatar} ${bal.name}`}
																			value={
																				bal.owes > 0
																					? `Owes ${c(bal.owes)}`
																					: `Credit ${c(bal.contributed - bal.borrowed + bal.repaid)}`
																			}
																		/>
																	))}
																</View>
															) : null}
														</View>
													) : null}

													{mExpenses.length > 0 ? (
														<View style={styles.sectionGap}>
															<Text style={styles.inputLabel}>Expenses</Text>
															{mExpenses.map((expense) => {
																const items = expense.items ?? [];
																const expenseTitle =
																	items.length > 0
																		? items.map((i) => i.name).join(", ")
																		: expense.description || "Expense";
																const hasMultipleItems = items.length > 1;
																return (
																	<BentoCard key={expense.id}>
																		<View style={styles.expenseCardRow}>
																			<View style={styles.expenseDetails}>
																				{expense.description ? (
																					<Text
																						style={styles.expenseDescription}
																					>
																						{expense.description}
																					</Text>
																				) : null}
																				{items.length > 0 ? (
																					<View style={styles.itemsList}>
																						{items.map((item, idx) => (
																							<View
																								key={idx}
																								style={styles.itemRow}
																							>
																								<Text
																									style={styles.itemName}
																									numberOfLines={1}
																								>
																									{item.name}
																								</Text>
																								<Text style={styles.itemPrice}>
																									{c(item.price)}
																								</Text>
																							</View>
																						))}
																					</View>
																				) : null}
																				<Text style={styles.listSubtitle}>
																					{expense.category} •{" "}
																					{formatShortDate(expense.date)}
																				</Text>
																				<Text style={styles.listSubtitle}>
																					{expense.paid_by
																						? `Paid by ${memberMap.get(expense.paid_by)?.name ?? "Member"}`
												: "Paid from budget"}
																					{expense.used_by
																						? ` · Used by ${memberMap.get(expense.used_by)?.name ?? "Member"}`
																						: ""}
																				</Text>
																			</View>
																			<View style={styles.expenseActions}>
																				{hasMultipleItems ? (
																					<Text style={styles.totalAmount}>
																						{c(expense.price)}
																					</Text>
																				) : null}
																				<View style={styles.actionButtons}>
																					<Pressable
																						hitSlop={12}
																						onPress={(event) => {
																							event.stopPropagation();
																							startEditExpense(expense);
																						}}
																						style={styles.editButton}
																						testID={`expense-edit-${expense.id}`}
																					>
																						<Ionicons
																							color={theme.primary}
																							name="pencil"
																							size={18}
																						/>
																					</Pressable>
																					<Pressable
																						hitSlop={12}
																						onPress={(event) => {
																							event.stopPropagation();
																							handleDeleteExpense(
																								expense.id,
																								expenseTitle,
																							);
																						}}
																						style={styles.editButton}
																						testID={`expense-delete-${expense.id}`}
																					>
																						<Ionicons
																							color={theme.danger}
																							name="trash"
																							size={18}
																						/>
																					</Pressable>
																				</View>
																			</View>
																		</View>
																	</BentoCard>
																);
															})}
														</View>
													) : (
														<EmptyState
															body="No expenses were recorded in this period."
															title="No expenses"
														/>
													)}

													{(() => {
														const archiveBorrows = monthFilteredExpenses.filter(
															(e) => e.is_borrow,
														);
														if (archiveBorrows.length === 0) return null;
														const borrowsByMember: Record<
															string,
															{
																member: { name: string; avatar: string };
																borrowed: number;
																contributed: number;
																repaid: number;
																records: ExpenseWithItems[];
															}
														> = {};
														archiveBorrows.forEach((e) => {
															const userId = e.used_by ?? e.added_by;
															const member = memberMap.get(userId);
															if (!member) return;
															if (!borrowsByMember[userId])
																borrowsByMember[userId] = {
																	member,
																	borrowed: 0,
																	contributed: 0,
																	repaid: 0,
																	records: [],
																};
															if (e.price > 0)
																borrowsByMember[userId].borrowed += e.price;
															else
																borrowsByMember[userId].repaid += Math.abs(
																	e.price,
																);
															borrowsByMember[userId].records.push(e);
														});
														const unpaidEntries = Object.entries(
															borrowsByMember,
														).filter(
															([, data]) =>
																Math.max(data.borrowed - data.repaid, 0) > 0,
														);
														if (unpaidEntries.length === 0) return null;
														return (
															<View style={styles.sectionGap}>
																<Text style={styles.inputLabel}>
																	Borrowed from Budget
																</Text>
																{unpaidEntries.map(([userId, data]) => {
																	const owes = Math.max(
																		data.borrowed - data.repaid,
																		0,
																	);
																	const isExpanded =
																		expandedBorrowUser === userId;
																	return (
																		<BentoCard key={userId}>
																			<Text
																				style={styles.listTitle}
																			>{`${data.member.avatar} ${data.member.name}`}</Text>
																			<View style={styles.borrowStatsRow}>
																				<View style={styles.borrowStatItem}>
																					<Text style={styles.borrowStatValue}>
																						{c(data.borrowed)}
																					</Text>
																					<Text style={styles.borrowStatLabel}>
																						Borrowed
																					</Text>
																				</View>
																				<View style={styles.cycleStatDivider} />
																				<View style={styles.borrowStatItem}>
																					<Text style={styles.borrowStatValue}>
																						{c(data.repaid)}
																					</Text>
																					<Text style={styles.borrowStatLabel}>
																						Repaid
																					</Text>
																				</View>
																				<View style={styles.cycleStatDivider} />
																				<View style={styles.borrowStatItem}>
																					<Text
																						style={[
																							styles.borrowStatValue,
																							{ color: theme.danger },
																						]}
																					>
																						{c(owes)}
																					</Text>
																					<Text style={styles.borrowStatLabel}>
																						Owes
																					</Text>
																				</View>
																			</View>
																			<Pressable
																				onPress={() =>
																					setExpandedBorrowUser(
																						isExpanded ? null : userId,
																					)
																				}
																				style={styles.detailsToggle}
																			>
																				<Text style={styles.detailsToggleText}>
																					{isExpanded
																						? "Hide history ▴"
																						: `${data.records.length} transaction${data.records.length !== 1 ? "s" : ""} ▾`}
																				</Text>
																			</Pressable>
																			{isExpanded
																				? data.records.map((record) => (
																						<View
																							key={record.id}
																							style={styles.borrowRecordRow}
																						>
																							<View style={{ flex: 1 }}>
																								<Text
																									style={styles.listSubtitle}
																								>
																									{`${record.price > 0 ? "↑ Borrowed" : "↓ Repaid"} ${c(Math.abs(record.price))} · ${formatShortDate(record.date)}${record.description ? ` · ${record.description}` : ""}`}
																								</Text>
																							</View>
																							<View
																								style={styles.actionButtons}
																							>
																								<Pressable
																									hitSlop={10}
																									onPress={() =>
																										startEditBorrow(record)
																									}
																									style={styles.editButton}
																								>
																									<Ionicons
																										color={theme.primary}
																										name="pencil"
																										size={18}
																									/>
																								</Pressable>
																								<Pressable
																									hitSlop={10}
																									onPress={() =>
																										handleDeleteExpense(
																											record.id,
																											record.price > 0
																												? "Borrow"
																												: "Repayment",
																										)
																									}
																									style={styles.editButton}
																								>
																									<Ionicons
																										color={theme.danger}
																										name="trash"
																										size={18}
																									/>
																								</Pressable>
																							</View>
																						</View>
																					))
																				: null}
																		</BentoCard>
																	);
																})}
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
											<Text style={styles.kicker}>{selectedPlan.name}</Text>
											<Text style={styles.metricText}>
												{c(selectedPlan.total_amount)}
											</Text>
											<Text style={styles.bodyMuted}>
												{formatShortDate(selectedPlan.start_date)} →{" "}
												{selectedPlan.end_date
													? formatShortDate(selectedPlan.end_date)
													: "ongoing"}
											</Text>
										</BentoCard>

										<BentoCard>
											<Text style={styles.kicker}>This cycle</Text>
											<View style={styles.spacer12} />
											<ProgressBar
												progress={
													currentPlanMonthStats.totalSpent /
													Math.max(currentPlanMonthStats.allocated, 1)
												}
											/>
											<View style={styles.spacer12} />
											<View style={styles.cycleStatsRow}>
												<View style={styles.cycleStat}>
													<Text style={styles.cycleStatValue}>
														{c(currentPlanMonthStats.totalSpent)}
													</Text>
													<Text style={styles.cycleStatLabel}>Spent</Text>
												</View>
												<View style={styles.cycleStatDivider} />
												<View
													style={[styles.cycleStat, { alignItems: "flex-end" }]}
												>
													<Text
														style={[
															styles.cycleStatValue,
															{
																color:
																	currentPlanMonthStats.remaining > 0
																		? theme.success
																		: theme.danger,
															},
														]}
													>
														{c(currentPlanMonthStats.remaining)}
													</Text>
													<Text style={styles.cycleStatLabel}>Remaining</Text>
												</View>
											</View>
											{showContribution ? (
												<Pressable
													onPress={() => setShowBreakdownDetails((v) => !v)}
													style={styles.detailsToggle}
												>
													<Text style={styles.detailsToggleText}>
														{showBreakdownDetails
															? "Hide details ▴"
															: "Details ▾"}
													</Text>
												</Pressable>
											) : null}
										</BentoCard>

										{showContribution && showBreakdownDetails ? (
											<View style={styles.sectionGap}>
												<Text style={styles.inputLabel}>
													Spending Breakdown
												</Text>
												<View style={styles.statRow}>
													<InfoPill
														label="Plan Budget"
														value={c(selectedPlan.total_amount)}
													/>
													{currentPlanMonthStats.contributions > 0 ? (
														<InfoPill
															label="+ Contributions"
															value={c(currentPlanMonthStats.contributions)}
														/>
													) : null}
													<InfoPill
														label="= Allocated"
														value={c(currentPlanMonthStats.allocated)}
													/>
													<InfoPill
														label="- Expenses"
														value={c(currentPlanMonthStats.spent)}
													/>
													{currentPlanMonthStats.contributions > 0 ? (
														<InfoPill
															label="- Own-pocket spent"
															value={c(currentPlanMonthStats.contributions)}
														/>
													) : null}
													{currentPlanMonthStats.borrowed > 0 ? (
														<InfoPill
															label="- Borrowed"
															value={c(currentPlanMonthStats.borrowed)}
														/>
													) : null}
													{currentPlanMonthStats.repaid > 0 ? (
														<InfoPill
															label="+ Repaid"
															value={c(currentPlanMonthStats.repaid)}
														/>
													) : null}
													<InfoPill
														label="= Remaining"
														value={c(currentPlanMonthStats.remaining)}
													/>
												</View>
												{Object.keys(currentPlanMonthStats.memberBalances)
													.length > 0 ? (
													<View style={styles.statRow}>
														{Object.values(
															currentPlanMonthStats.memberBalances,
														).map((bal) => (
															<InfoPill
																key={bal.name}
																label={`${bal.avatar} ${bal.name}`}
																value={
																	bal.owes > 0
																		? `Owes ${c(bal.owes)}`
																		: `Credit ${c(bal.contributed - bal.borrowed + bal.repaid)}`
																}
															/>
														))}
													</View>
												) : null}
											</View>
										) : null}

										<View style={styles.rowBetween}>
											<View style={styles.segmentRow}>
												{expenseFilters.map((filter) => (
													<CategoryChip
														key={filter}
														active={expenseView === filter}
														label={filter}
														onPress={() => setExpenseView(filter)}
													/>
												))}
											</View>
											<Pressable
												hitSlop={10}
												onPress={() => setShowExpenseFilters(true)}
											>
												<Ionicons
													color={theme.primary}
													name="options-outline"
													size={24}
												/>
											</Pressable>
										</View>

										<View style={styles.dualActions}>
											<ModernButton
												icon={<Ionicons color={theme.onPrimary} name="add" size={18} />}
												onPress={() => {
													setShowExpenseComposer(true);
												}}
												testID="open-add-expense"
												text="Add expense"
											/>
											<ModernButton
												icon={
													<Ionicons
														color={theme.onPrimary}
														name="cash-outline"
														size={18}
													/>
												}
												onPress={() => setShowBorrowComposer(true)}
												secondary
												testID="open-borrow"
												text="Borrow"
											/>
										</View>
										<ModernButton
											icon={<Ionicons color={theme.primary} name="camera-outline" size={18} />}
											onPress={() => setShowReceiptScanner(true)}
											secondary
											testID="open-receipt-scanner"
											text="Scan bill to add items"
										/>

										{filteredExpenses.length > 0 ? (
											filteredExpenses.map((expense) => {
												const items = expense.items ?? [];
												const expenseTitle =
													items.length > 0
														? items.map((i) => i.name).join(", ")
														: expense.description || "Expense";
												const hasMultipleItems = items.length > 1;

												return (
													<BentoCard key={expense.id}>
														<View style={styles.expenseCardRow}>
															<View style={styles.expenseDetails}>
																{expense.description ? (
																	<Text style={styles.expenseDescription}>
																		{expense.description}
																	</Text>
																) : null}
																{items.length > 0 ? (
																	<View style={styles.itemsList}>
																		{items.map((item, idx) => (
																			<View key={idx} style={styles.itemRow}>
																				<Text
																					style={styles.itemName}
																					numberOfLines={1}
																				>
																					{item.name}
																				</Text>
																				<Text style={styles.itemPrice}>
																					{c(item.price)}
																				</Text>
																			</View>
																		))}
																	</View>
																) : null}
																<Text style={styles.listSubtitle}>
																	{expense.category} •{" "}
																	{formatShortDate(expense.date)}
																</Text>
																<Text style={styles.listSubtitle}>
																	{expense.paid_by
																		? `Paid by ${memberMap.get(expense.paid_by)?.name ?? "Member"}`
											: "Paid from budget"}
																	{expense.used_by
																		? ` · Used by ${memberMap.get(expense.used_by)?.name ?? "Member"}`
																		: ""}
																</Text>
															</View>

															<View style={styles.expenseActions}>
																{hasMultipleItems ? (
																	<Text style={styles.totalAmount}>
																		{c(expense.price)}
																	</Text>
																) : null}
																<View style={styles.actionButtons}>
																	<Pressable
																		hitSlop={12}
																		onPress={(event) => {
																			event.stopPropagation();
																			startEditExpense(expense);
																		}}
																		style={styles.editButton}
																		testID={`expense-edit-${expense.id}`}
																	>
																		<Ionicons
																			color={theme.primary}
																			name="pencil"
																			size={18}
																		/>
																	</Pressable>
																	<Pressable
																		hitSlop={12}
																		onPress={(event) => {
																			event.stopPropagation();
																			handleDeleteExpense(
																				expense.id,
																				expenseTitle,
																			);
																		}}
																		style={styles.editButton}
																		testID={`expense-delete-${expense.id}`}
																	>
																		<Ionicons
																			color={theme.danger}
																			name="trash"
																			size={18}
																		/>
																	</Pressable>
																</View>
															</View>
														</View>
													</BentoCard>
												);
											})
										) : (
											<EmptyState
								body="Use the add button to capture a shared expense."
												title="No expenses in this view"
											/>
										)}

										{(() => {
											const planBorrows = currentPlanExpenses.filter(
												(e) => e.is_borrow && e.plan_id === selectedPlan.id,
											);
											if (planBorrows.length === 0) return null;
											const borrowsByMember: Record<
												string,
												{
													member: { name: string; avatar: string };
													borrowed: number;
													contributed: number;
													repaid: number;
													records: ExpenseWithItems[];
												}
											> = {};
											planBorrows.forEach((e) => {
												const userId = e.used_by ?? e.added_by;
												const member = memberMap.get(userId);
												if (!member) return;
												if (!borrowsByMember[userId])
													borrowsByMember[userId] = {
														member,
														borrowed: 0,
														contributed: 0,
														repaid: 0,
														records: [],
													};
												if (e.price > 0)
													borrowsByMember[userId].borrowed += e.price;
												else
													borrowsByMember[userId].repaid += Math.abs(e.price);
												borrowsByMember[userId].records.push(e);
											});
											const unpaidBorrows = Object.entries(
												borrowsByMember,
											).filter(
												([, data]) =>
													Math.max(data.borrowed - data.repaid, 0) > 0,
											);
											if (unpaidBorrows.length === 0) return null;
											return (
												<View style={styles.sectionGap}>
													<Text style={styles.inputLabel}>
														Borrowed from Budget
													</Text>
													{unpaidBorrows.map(([userId, data]) => {
														const owes = Math.max(
															data.borrowed - data.repaid,
															0,
														);
														const isExpanded = expandedBorrowUser === userId;
														return (
															<BentoCard key={userId}>
																{/* Summary row */}
																<View style={styles.borrowHeaderRow}>
																	<Text
																		style={styles.listTitle}
																	>{`${data.member.avatar} ${data.member.name}`}</Text>
																	<ModernButton
																		onPress={() => {
											setRepayForm({
												amount: "",
												borrowId: userId,
												date: todayLocalDate(),
											});
																			setShowRepayComposer(true);
																		}}
																		secondary
																		style={{ flexShrink: 0 }}
																		text="Repay"
																		testID={`repay-${userId}`}
																	/>
																</View>

																{/* Compact 3-stat row */}
																<View style={styles.borrowStatsRow}>
																	<View style={styles.borrowStatItem}>
																		<Text style={styles.borrowStatValue}>
																			{c(data.borrowed)}
																		</Text>
																		<Text style={styles.borrowStatLabel}>
																			Borrowed
																		</Text>
																	</View>
																	<View style={styles.cycleStatDivider} />
																	<View style={styles.borrowStatItem}>
																		<Text style={styles.borrowStatValue}>
																			{c(data.repaid)}
																		</Text>
																		<Text style={styles.borrowStatLabel}>
																			Repaid
																		</Text>
																	</View>
																	<View style={styles.cycleStatDivider} />
																	<View style={styles.borrowStatItem}>
																		<Text
																			style={[
																				styles.borrowStatValue,
																				{
																					color:
																						owes > 0
																							? theme.danger
																							: theme.success,
																				},
																			]}
																		>
																			{c(owes)}
																		</Text>
																		<Text style={styles.borrowStatLabel}>
																			Owes
																		</Text>
																	</View>
																</View>

																{/* Collapsible history */}
																<Pressable
																	onPress={() =>
																		setExpandedBorrowUser(
																			isExpanded ? null : userId,
																		)
																	}
																	style={styles.detailsToggle}
																>
																	<Text style={styles.detailsToggleText}>
																		{isExpanded
																			? "Hide history ▴"
																			: `${data.records.length} transaction${data.records.length !== 1 ? "s" : ""} ▾`}
																	</Text>
																</Pressable>

																{isExpanded
																	? data.records.map((record) => (
																			<View
																				key={record.id}
																				style={styles.borrowRecordRow}
																			>
																				<View style={{ flex: 1 }}>
																					<Text style={styles.listSubtitle}>
																						{`${record.price > 0 ? "↑ Borrowed" : "↓ Repaid"} ${c(Math.abs(record.price))} · ${formatShortDate(record.date)}${record.description ? ` · ${record.description}` : ""}`}
																					</Text>
																				</View>
																				<View style={styles.actionButtons}>
																					<Pressable
																						hitSlop={10}
																						onPress={() =>
																							startEditBorrow(record)
																						}
																						style={styles.editButton}
																					>
																						<Ionicons
																							color={theme.primary}
																							name="pencil"
																							size={18}
																						/>
																					</Pressable>
																					<Pressable
																						hitSlop={10}
																						onPress={() =>
																							handleDeleteExpense(
																								record.id,
																								record.price > 0
																									? "Borrow"
																									: "Repayment",
																							)
																						}
																						style={styles.editButton}
																					>
																						<Ionicons
																							color={theme.danger}
																							name="trash"
																							size={18}
																						/>
																					</Pressable>
																				</View>
																			</View>
																		))
																	: null}
															</BentoCard>
														);
													})}
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
									onPress={() =>
										selectedPlan &&
										handleResetBudget(selectedPlan.id, selectedPlan.name)
									}
									testID="reset-budget-button"
									text="Reset Budget"
								/>
							</>
						)}
					</ModalScaffold>
				</Modal>

				<Modal animationType="slide" onRequestClose={() => setShowReceiptScanner(false)} transparent visible={showReceiptScanner}>
					<ReceiptScannerSheet
						currency={userCurrency}
						onClose={() => setShowReceiptScanner(false)}
						onConfirm={handleReceiptScanConfirm}
						session={session}
						visible={showReceiptScanner}
					/>
				</Modal>

				<Modal animationType="slide" onRequestClose={closeExpenseComposer} transparent visible={showExpenseComposer}>
					<BottomSheet onClose={closeExpenseComposer}>
						<Text style={styles.sectionTitle}>
							{editingExpenseId ? "Edit Expense" : "Add Expense"}
						</Text>

						<View style={styles.fieldSection}>
							<View style={styles.rowBetween}>
								<Text style={styles.inputLabel}>Items</Text>
								<Text style={styles.totalText}>Total: {c(expenseTotal)}</Text>
							</View>

							{expenseForm.items.map((item, index) => (
								<View key={index}>
									<View style={styles.itemInputRow}>
									<TextInput
										onChangeText={(value) =>
											updateExpenseItem(index, "name", value)
										}
										onFocus={() =>
											setActiveExpenseItemSuggestionIndex(
												item.name.trim() ? index : null,
											)
										}
										placeholder="Item name"
										style={[styles.textInput, styles.itemNameInput]}
										value={item.name}
									/>
									<TextInput
										keyboardType="numeric"
										onChangeText={(value) =>
											updateExpenseItem(index, "price", value)
										}
										onFocus={() => setActiveExpenseItemSuggestionIndex(null)}
										placeholder={userCurrency}
										style={[styles.textInput, styles.itemPriceInput]}
										value={item.price}
									/>
					{expenseForm.items.length > 1 ? (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={`Remove item ${index + 1}`}
							hitSlop={10}
											onPress={() => removeExpenseItem(index)}
											style={styles.removeItemButton}
										>
											<Ionicons
												color={theme.danger}
												name="close-circle"
												size={24}
											/>
										</Pressable>
									) : null}
									</View>
									{activeExpenseItemSuggestionIndex === index &&
									recentItemSuggestions.length > 0 ? (
										<View
											style={styles.itemSuggestionList}
											testID={`expense-item-suggestions-${index}`}
										>
											<Text style={styles.itemSuggestionLabel}>Recent matches</Text>
											{recentItemSuggestions.map((suggestion) => (
												<Pressable
													key={`${suggestion.name}-${suggestion.price}`}
													onPress={() => applyRecentItemSuggestion(index, suggestion)}
													style={styles.itemSuggestionButton}
													testID={`expense-item-suggestion-${index}-${suggestion.name}`}
												>
													<View style={styles.itemSuggestionCopy}>
														<Text numberOfLines={1} style={styles.itemSuggestionTitle}>
															{suggestion.name}
														</Text>
														<Text style={styles.itemSuggestionMeta}>
															Last price {c(suggestion.price)} · {suggestion.category}
														</Text>
													</View>
													<Ionicons color={theme.primary} name="arrow-forward" size={18} />
												</Pressable>
											))}
										</View>
									) : null}
								</View>
							))}

							<Pressable
								hitSlop={10}
								onPress={addExpenseItem}
								style={styles.addItemButton}
							>
								<Ionicons
									color={theme.primary}
									name="add-circle-outline"
									size={20}
								/>
								<Text style={styles.addItemText}>Add item</Text>
							</Pressable>
						</View>

						<View style={styles.fieldSection}>
							<Text style={styles.inputLabel}>Category</Text>
							<View style={styles.segmentRow}>
				{visibleExpenseCategories.map((category) => (
									<CategoryChip
										key={category.key}
										active={expenseForm.category === category.key}
										label={category.key}
										onPress={() =>
											setExpenseForm((current) => ({
												...current,
												category: category.key,
											}))
										}
									/>
				))}
			</View>
			{expenseCategories.length > visibleExpenseCategories.length ? (
				<Pressable accessibilityRole="button" onPress={() => setShowMoreExpenseCategories(true)} style={styles.addItemButton}>
					<Text style={styles.addItemText}>More categories</Text>
				</Pressable>
			) : null}
		</View>
						{expenseForm.category === "Other" ? (
							<LabeledInput
								label="Custom category"
								onChangeText={(value) =>
									setExpenseForm((current) => ({
										...current,
										customCategory: value,
									}))
								}
								testID="expense-category-custom-input"
								value={expenseForm.customCategory}
							/>
						) : null}
						{showContribution ? (
							<>
								<View style={styles.fieldSection}>
									<Text style={styles.inputLabel}>Who paid?</Text>
									<View style={styles.segmentRow}>
										<CategoryChip
											active={expenseForm.paidBy === null}
											label="Shared"
											onPress={() =>
												setExpenseForm((current) => ({
													...current,
													paidBy: null,
													usedBy: current.usedBy ?? session?.user?.id ?? null,
												}))
											}
										/>
										{members.map((member) => (
											<CategoryChip
												key={member.user_id}
												active={expenseForm.paidBy === member.user_id}
												label={member.user_profile?.name ?? "Member"}
												onPress={() =>
													setExpenseForm((current) => ({
														...current,
														paidBy: member.user_id,
														usedBy: null,
													}))
												}
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
												label="Everyone"
												onPress={() =>
													setExpenseForm((current) => ({
														...current,
														usedBy: null,
													}))
												}
											/>
											{members.map((member) => (
												<CategoryChip
													key={member.user_id}
													active={expenseForm.usedBy === member.user_id}
													label={member.user_profile?.name ?? "Member"}
													onPress={() =>
														setExpenseForm((current) => ({
															...current,
															usedBy: member.user_id,
														}))
													}
												/>
											))}
										</View>
									</View>
								) : null}
							</>
						) : null}
						<DatePickerField
							date={expenseForm.date}
							label="Date"
							onDateChange={(value) =>
								setExpenseForm((current) => ({ ...current, date: value }))
							}
							testID="expense-date-input"
						/>

						<LabeledInput
							label="Description (optional)"
							onChangeText={(value) =>
								setExpenseForm((current) => ({
									...current,
									description: value,
								}))
							}
							testID="expense-description-input"
							value={expenseForm.description}
						/>

						<View style={styles.spacer16} />
						<ModernButton
							loading={actionBusy}
							onPress={handleAddExpense}
							testID="expense-save-button"
							text={editingExpenseId ? "Update expense" : "Save expense"}
						/>
					</BottomSheet>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => setShowShoppingComposer(false)}
					transparent
					visible={showShoppingComposer}
				>
					<BottomSheet onClose={() => setShowShoppingComposer(false)}>
						<Text style={styles.sectionTitle}>Add Shopping Item</Text>
						<LabeledInput
							label="Product name"
							onChangeText={(value) =>
								setShoppingForm((current) => ({ ...current, name: value }))
							}
							testID="shopping-name-input"
							value={shoppingForm.name}
						/>
						<LabeledInput
							label="Quantity (optional)"
							onChangeText={(value) =>
								setShoppingForm((current) => ({ ...current, quantity: value }))
							}
							testID="shopping-quantity-input"
							value={shoppingForm.quantity}
						/>
						<Text style={styles.inputLabel}>Category</Text>
						<View style={styles.segmentRow}>
							{shoppingCategories.map((category) => (
								<CategoryChip
									key={category}
									active={shoppingForm.category === category}
									label={category}
									onPress={() =>
										setShoppingForm((current) => ({ ...current, category }))
									}
								/>
							))}
						</View>
						<View style={styles.spacer16} />
						<ModernButton
							loading={actionBusy}
							onPress={handleAddShoppingItem}
							testID="shopping-save-button"
							text="Add item"
						/>
					</BottomSheet>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => {
						setShowBoughtComposer(false);
						setPendingBoughtItem(null);
						setBoughtForm({ price: "", paidBy: null, planId: "" });
					}}
					transparent
					visible={showBoughtComposer}
				>
					<BottomSheet
						onClose={() => {
							setShowBoughtComposer(false);
							setPendingBoughtItem(null);
							setBoughtForm({ price: "", paidBy: null, planId: "" });
						}}
					>
						<Text style={styles.sectionTitle}>Mark as Bought</Text>
						{pendingBoughtItem ? (
							<>
								<Text style={styles.bodyMuted}>
									{pendingBoughtItem.name}
									{pendingBoughtItem.quantity
										? ` (Qty: ${pendingBoughtItem.quantity})`
										: ""}
									{pendingBoughtItem.category
										? ` • ${pendingBoughtItem.category}`
										: ""}
								</Text>
								<View style={styles.spacer12} />
								<Text style={styles.inputLabel}>Budget plan (optional)</Text>
								<View style={styles.segmentRow}>
									<CategoryChip
										active={boughtForm.planId === ""}
										label="No budget link"
										onPress={() =>
											setBoughtForm((current) => ({
												...current,
												planId: "",
												price: "",
												paidBy: null,
											}))
										}
									/>
									{plans.map((plan) => (
										<CategoryChip
											key={plan.id}
											active={boughtForm.planId === plan.id}
											label={plan.name}
											onPress={() =>
												setBoughtForm((current) => ({
													...current,
													planId: plan.id,
												}))
											}
										/>
									))}
								</View>
								{boughtForm.planId ? (
									<>
										<LabeledInput
											keyboardType="numeric"
											label={`Price (${userCurrency})`}
											onChangeText={(value) =>
												setBoughtForm((current) => ({
													...current,
													price: value,
												}))
											}
											testID="bought-price-input"
											value={boughtForm.price}
										/>
										<Text style={styles.inputLabel}>Who paid?</Text>
										<View style={styles.segmentRow}>
											<CategoryChip
												active={boughtForm.paidBy === null}
												label="Family Budget"
												onPress={() =>
													setBoughtForm((current) => ({
														...current,
														paidBy: null,
													}))
												}
											/>
											{members.map((member) => (
												<CategoryChip
													key={member.id}
													active={boughtForm.paidBy === member.user_id}
													label={member.user_profile?.name ?? "Member"}
													onPress={() =>
														setBoughtForm((current) => ({
															...current,
															paidBy: member.user_id,
														}))
													}
												/>
											))}
										</View>
									</>
								) : null}
								<View style={styles.spacer16} />
								<ModernButton
									loading={actionBusy}
									onPress={handleConfirmBought}
									testID="confirm-bought-button"
									text={
										boughtForm.planId
											? "Confirm & Add to Budget"
											: "Confirm Bought"
									}
								/>
							</>
						) : null}
					</BottomSheet>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => {
						setShowBorrowComposer(false);
						setBorrowForm({
							amount: "",
							date: todayLocalDate(),
							description: "",
						});
						setEditingBorrowId(null);
					}}
					transparent
					visible={showBorrowComposer}
				>
					<BottomSheet
						onClose={() => {
							setShowBorrowComposer(false);
							setBorrowForm({
								amount: "",
								date: todayLocalDate(),
								description: "",
							});
							setEditingBorrowId(null);
						}}
					>
						<Text style={styles.sectionTitle}>
							{editingBorrowId ? "Edit Borrow" : "Borrow from Budget"}
						</Text>
						<LabeledInput
							keyboardType="numeric"
							label={`Amount (${userCurrency})`}
							onChangeText={(value) =>
								setBorrowForm((current) => ({ ...current, amount: value }))
							}
							testID="borrow-amount-input"
							value={borrowForm.amount}
						/>
						<DatePickerField
							date={borrowForm.date}
							label="Date"
							onDateChange={(value) =>
								setBorrowForm((current) => ({ ...current, date: value }))
							}
							testID="borrow-date-input"
						/>
						<LabeledInput
							label="Description (optional)"
							onChangeText={(value) =>
								setBorrowForm((current) => ({ ...current, description: value }))
							}
							testID="borrow-description-input"
							value={borrowForm.description}
						/>
						<View style={styles.spacer16} />
						<ModernButton
							loading={actionBusy}
							onPress={handleBorrow}
							testID="borrow-save-button"
							text={editingBorrowId ? "Update" : "Borrow"}
						/>
					</BottomSheet>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => {
						setShowRepayComposer(false);
						setRepayForm({
							amount: "",
							borrowId: "",
							date: todayLocalDate(),
						});
					}}
					transparent
					visible={showRepayComposer}
				>
					<BottomSheet
						onClose={() => {
							setShowRepayComposer(false);
							setRepayForm({
								amount: "",
								borrowId: "",
								date: todayLocalDate(),
							});
						}}
					>
						<Text style={styles.sectionTitle}>Repay to Budget</Text>
						<LabeledInput
							keyboardType="numeric"
							label={`Amount (${userCurrency})`}
							onChangeText={(value) =>
								setRepayForm((current) => ({ ...current, amount: value }))
							}
							testID="repay-amount-input"
							value={repayForm.amount}
						/>
						<DatePickerField
							date={repayForm.date}
							label="Date"
							onDateChange={(value) =>
								setRepayForm((current) => ({ ...current, date: value }))
							}
							testID="repay-date-input"
						/>
						<View style={styles.spacer16} />
						<ModernButton
							loading={actionBusy}
							onPress={handleRepay}
							testID="repay-save-button"
							text="Repay"
						/>
					</BottomSheet>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => setShowMembers(false)}
					presentationStyle="pageSheet"
					visible={showMembers}
				>
					<ModalScaffold
						closeTestID="close-members-modal"
						onClose={() => setShowMembers(false)}
						title="Members"
					>
						{members.map((member) => (
							<BentoCard key={member.id}>
								<View style={styles.rowBetween}>
									<View style={styles.memberAvatar}>
										<Text style={styles.memberAvatarText}>
											{member.user_profile?.avatar_emoji ?? "🏡"}
										</Text>
									</View>
									<View style={{ flex: 1 }}>
										<Text style={styles.listTitle}>
											{member.user_profile?.name ?? "Member"}
										</Text>
										<Text style={styles.listSubtitle}>
											{member.user_profile?.email ?? "—"}
										</Text>
										<Text style={styles.listSubtitle}>
											Joined {formatShortDate(member.joined_at)}
										</Text>
									</View>
								</View>
							</BentoCard>
						))}
					</ModalScaffold>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => setShowInvite(false)}
					presentationStyle="pageSheet"
					visible={showInvite}
				>
					<ModalScaffold
						closeTestID="close-invite-modal"
						onClose={() => setShowInvite(false)}
						title="Invite Member"
					>
						<Text style={styles.bodyMuted}>
							Send an email invite or share the generated link. The invite opens
							NestLedger and joins the selected profile.
						</Text>
						<LabeledInput
							label="Invitee email"
							onChangeText={setInviteEmail}
							testID="invite-email-input"
							value={inviteEmail}
						/>
						<ModernButton
							loading={actionBusy}
							onPress={handleSendInvite}
							testID="invite-send-email"
							text="Send invite email"
						/>
						{lastInviteLink ? (
							<BentoCard>
								<Text style={styles.cardTitle}>Shareable invite link</Text>
								<Text style={styles.linkBlock}>{lastInviteLink}</Text>
								<View style={styles.dualActions}>
									<ModernButton
										onPress={() =>
											Clipboard.setStringAsync(lastInviteLink).then(() =>
												announce("Invite link copied."),
											)
										}
										secondary
										testID="invite-copy-link"
										text="Copy link"
									/>
									<ModernButton
										onPress={() => Share.share({ message: lastInviteLink })}
										testID="invite-share-link"
										text="Share link"
									/>
								</View>
							</BentoCard>
						) : null}
					</ModalScaffold>
				</Modal>

				<Modal
					animationType="slide"
					onRequestClose={() => setShowNotifications(false)}
					presentationStyle="pageSheet"
					visible={showNotifications}
				>
					<ModalScaffold
						closeTestID="close-notifications-modal"
						onClose={() => setShowNotifications(false)}
						rightAction={
							<Pressable
								hitSlop={10}
								onPress={() =>
									activeProfile &&
									session?.user &&
									notificationApi
										.markAllRead(activeProfile.id, session.user.id)
										.then(() =>
											setNotifications((prev) =>
												prev.map((n) => ({ ...n, is_read: true })),
											),
										)
								}
								testID="notifications-mark-all-read"
							>
								<Text style={styles.linkText}>Mark all read</Text>
							</Pressable>
						}
						title="Notifications"
					>
						{notifications.length > 0 ? (
							notifications.map((item) => (
								<Pressable
									key={item.id}
									onPress={() =>
										notificationApi
											.markRead(item.id)
											.then(() =>
												setNotifications((prev) =>
													prev.map((n) =>
														n.id === item.id ? { ...n, is_read: true } : n,
													),
												),
											)
									}
									testID={`notification-item-${item.id}`}
								>
									<BentoCard tone={item.is_read ? "default" : "highlight"}>
										<Text style={styles.listTitle}>{item.message}</Text>
										<Text style={styles.listSubtitle}>
											{formatShortDate(item.created_at)}
										</Text>
									</BentoCard>
								</Pressable>
							))
						) : (
							<EmptyState
								body="Recent activity for this profile will show here."
								title="All caught up"
							/>
						)}
					</ModalScaffold>
				</Modal>

				<ProfileSettingsModal
					actionBusy={actionBusy}
					contributionEnabled={contributionEnabled}
					deletingProfile={
						activeProfile ? deletingProfileIds.has(activeProfile.id) : false
					}
					onChange={setProfileForm}
					onClose={() => setShowProfileSettings(false)}
					onDeleteSpace={() =>
						activeProfile && handleDeleteSpace(activeProfile.id)
					}
					onSave={handleSaveSettings}
					onSignOut={() => authApi.signOut()}
					onToggleContribution={handleToggleContribution}
					profileForm={profileForm}
					visible={showProfileSettings}
				/>

				<Modal
					animationType="slide"
					onRequestClose={() => setShowExpenseFilters(false)}
					presentationStyle="pageSheet"
					visible={showExpenseFilters}
				>
					<ModalScaffold
						closeTestID="close-expense-filters-modal"
						onClose={() => setShowExpenseFilters(false)}
						title="Filter Expenses"
					>
						<Text style={styles.inputLabel}>Time window</Text>
						<View style={styles.segmentRow}>
							{expenseFilters.map((filter) => (
								<CategoryChip
									key={filter}
									active={expenseView === filter}
									label={filter}
									onPress={() => setExpenseView(filter)}
								/>
							))}
						</View>
						<Text style={styles.inputLabel}>Category search</Text>
						<View style={styles.segmentRow}>
							<CategoryChip
								active={expenseCategoryFilter === "All"}
								label="All"
								onPress={() => setExpenseCategoryFilter("All")}
							/>
							{expenseCategories.map((category) => (
								<CategoryChip
									key={category.key}
									active={expenseCategoryFilter === category.key}
									label={category.key}
									onPress={() => setExpenseCategoryFilter(category.key)}
								/>
							))}
						</View>
					</ModalScaffold>
				</Modal>
			</SafeAreaView>
		</GestureHandlerRootView>
	);
}
