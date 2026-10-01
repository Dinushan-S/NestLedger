import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { formatCurrency } from "../../../constants/nestledger";
import { useTheme } from "../../../lib/theme-context";
import { useStyles } from "../nestledger.styles";
import BentoCard from "../../ui/BentoCard";
import { ModalScaffold } from "../../ui/ModalScaffold";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import type { ExpenseShortcut, ExpenseWithItems, UserProfile } from "../../../lib/nestledger";
import { EmptyState, InfoPill, QuickActionCard } from "../nestledger.ui";
import { expenseShortcutName, expenseShortcutTotal, isSavedExpenseShortcut } from "../expenseSuggestions";

type Props = {
	actionBusy: boolean;
	currency: string;
	recentExpenses: ExpenseWithItems[];
	expenseShortcuts: ExpenseShortcut[];
	userProfile: UserProfile;
	profileName: string;
	reminderBusy: boolean;
	reminderEnabled: boolean;
	reminderTime: string;
	onAddExpenseShortcut: (expense: ExpenseWithItems) => Promise<boolean>;
	onDeleteExpenseShortcut: (shortcut: ExpenseShortcut) => void;
	onMembers: () => void;
	onInvite: () => void;
	onSettings: () => void;
	onSwitchProfile: () => void;
	onToggleReminder: (enabled: boolean) => Promise<void>;
	onReminderTimeChange: (time: string) => void;
	onSaveReminderTime: () => Promise<void>;
	onAndroidKeyboardVisibleChange: (visible: boolean) => void;
};

export default function ProfileTab({
	actionBusy,
	currency,
	recentExpenses,
	expenseShortcuts,
	userProfile,
	profileName,
	reminderBusy,
	reminderEnabled,
	reminderTime,
	onAddExpenseShortcut,
	onDeleteExpenseShortcut,
	onMembers,
	onInvite,
	onSettings,
	onSwitchProfile,
	onToggleReminder,
	onReminderTimeChange,
	onSaveReminderTime,
	onAndroidKeyboardVisibleChange,
}: Props) {
	const { theme } = useTheme();
	const styles = useStyles();
	const [showShortcutPicker, setShowShortcutPicker] = useState(false);
	return (
		<View style={styles.sectionGap}>
			<BentoCard tone="highlight">
				<Text style={styles.sectionTitle}>
					{userProfile.name}
				</Text>
				<Text style={styles.bodyMuted}>{userProfile.email}</Text>
				<View style={styles.statRow}>
					<InfoPill
						label="Avatar"
						value={userProfile.avatar_emoji ?? "🏡"}
					/>
					<InfoPill label="Home" value={profileName} />
				</View>
			</BentoCard>

			<View style={styles.quickActionGrid}>
				<QuickActionCard
					icon="people-outline"
					label="Members"
					onPress={onMembers}
					testID="profile-open-members"
				/>
				<QuickActionCard
					icon="person-add-outline"
					label="Invite"
					onPress={onInvite}
					testID="profile-open-invite"
				/>
				<QuickActionCard
					icon="settings-outline"
					label="Settings"
					onPress={onSettings}
					testID="profile-open-settings"
				/>
				<QuickActionCard
					icon="swap-horizontal-outline"
					label="Switch"
					onPress={onSwitchProfile}
					testID="profile-open-switcher"
				/>
			</View>

			<BentoCard>
				<View style={styles.expenseShortcutSection}>
					<Text style={styles.sectionTitle}>Expense Shortcuts</Text>
					<Text style={styles.bodyMuted}>Save an expense you use often. Tap it in Add Expense only on the days you need it.</Text>
					<Pressable
						accessibilityRole="button"
						disabled={actionBusy}
						onPress={() => setShowShortcutPicker(true)}
						style={styles.addItemButton}
						testID="profile-add-expense-shortcut"
					>
						<Ionicons color={theme.primary} name="add-circle-outline" size={20} />
						<Text style={styles.addItemText}>Add from history</Text>
					</Pressable>
					{expenseShortcuts.length === 0 ? (
						<Text style={styles.bodyMuted}>No shortcuts saved yet.</Text>
					) : expenseShortcuts.map((shortcut) => (
						<View key={shortcut.id} style={styles.expenseShortcutRow}>
							<View style={styles.expenseShortcutCopy}>
								<Text style={styles.listTitle}>{shortcut.name}</Text>
								<Text style={styles.listSubtitle}>
									{formatCurrency(expenseShortcutTotal(shortcut), currency)} · {shortcut.category}
								</Text>
							</View>
							<Pressable
								accessibilityLabel={`Delete ${shortcut.name} shortcut`}
								accessibilityRole="button"
								disabled={actionBusy}
								hitSlop={10}
								onPress={() => onDeleteExpenseShortcut(shortcut)}
								style={styles.editButton}
								testID={`delete-expense-shortcut-${shortcut.id}`}
							>
								<Ionicons color={theme.danger} name="trash-outline" size={20} />
							</Pressable>
						</View>
					))}
				</View>
			</BentoCard>

			<BentoCard>
				<View style={styles.reminderSection}>
					<Text style={styles.inputLabel}>Daily Reminder</Text>
					<View style={styles.reminderRow}>
						<View style={styles.reminderInfo}>
							<Ionicons
								color={theme.primary}
								name="notifications-outline"
								size={24}
							/>
							<View style={styles.reminderTextWrap}>
								<Text style={styles.reminderText}>
									Remind me to add expenses
								</Text>
								<Text style={styles.reminderSubtext}>
									Daily notification at {reminderTime}
								</Text>
							</View>
						</View>
						<Pressable
							hitSlop={10}
							disabled={reminderBusy}
							onPress={() => onToggleReminder(!reminderEnabled)}
							style={[
								styles.toggleButton,
								reminderEnabled && styles.toggleButtonActive,
							]}
						>
							<View
								style={[
									styles.toggleCircle,
									reminderEnabled && styles.toggleCircleActive,
								]}
							/>
						</Pressable>
					</View>

					{reminderEnabled ? (
						<View style={styles.timePickerRow}>
							<Text style={styles.inputLabel}>Reminder time</Text>
							<TextInput
		keyboardType="numbers-and-punctuation"
		editable={!reminderBusy}
		onBlur={() => onAndroidKeyboardVisibleChange(false)}
		onChangeText={onReminderTimeChange}
		onEndEditing={() => void onSaveReminderTime()}
		onFocus={() => {
			if (Platform.OS === "android") onAndroidKeyboardVisibleChange(true);
		}}
		placeholder="20:00"
								style={styles.timeInput}
								value={reminderTime}
							/>
							<Text style={styles.timeHint}>
								Format: HH:MM (24-hour)
							</Text>
						</View>
					) : null}
				</View>
			</BentoCard>

			<ModalScaffold
				closeTestID="close-expense-shortcut-picker"
				onClose={() => setShowShortcutPicker(false)}
				title="Choose a past expense"
				visible={showShortcutPicker}
			>
				{recentExpenses.length === 0 ? (
					<EmptyState body="Add an expense first, then save it here as a shortcut." title="No past expenses yet" />
				) : recentExpenses.map((expense) => {
					const isSaved = isSavedExpenseShortcut(expense, expenseShortcuts);
					return (
						<Pressable
							key={expense.id}
							accessibilityRole="button"
							accessibilityState={{ disabled: isSaved || actionBusy }}
							disabled={isSaved || actionBusy}
							onPress={async () => {
								if (await onAddExpenseShortcut(expense)) setShowShortcutPicker(false);
							}}
							style={[styles.expenseShortcutChoice, (isSaved || actionBusy) && styles.expenseShortcutChoiceDisabled]}
							testID={`expense-shortcut-source-${expense.id}`}
						>
							<View style={styles.expenseShortcutCopy}>
								<Text style={styles.listTitle}>{expenseShortcutName(expense)}</Text>
								<Text style={styles.listSubtitle}>
									{formatCurrency(expenseShortcutTotal(expense), currency)} · {expense.category}
								</Text>
							</View>
							<Ionicons color={isSaved ? theme.success : theme.primary} name={isSaved ? "checkmark-circle-outline" : "add-circle-outline"} size={22} />
						</Pressable>
					);
				})}
			</ModalScaffold>
		</View>
	);
}
