import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../lib/theme-context";
import { useStyles } from "../nestledger.styles";
import BentoCard from "../../ui/BentoCard";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import type { UserProfile } from "../../../lib/nestledger-services";
import { InfoPill, QuickActionCard } from "../nestledger.ui";

type Props = {
	userProfile: UserProfile;
	profileName: string;
	reminderBusy: boolean;
	reminderEnabled: boolean;
	reminderTime: string;
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
	userProfile,
	profileName,
	reminderBusy,
	reminderEnabled,
	reminderTime,
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
		</View>
	);
}
