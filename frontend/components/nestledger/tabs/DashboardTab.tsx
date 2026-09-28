import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../lib/theme-context";
import { useStyles } from "../nestledger.styles";
import BentoCard from "../../ui/BentoCard";
import { Pressable, Text, View } from "react-native";
import type { AppNotification, BudgetPlan, ShoppingItem, SpaceType } from "../../../lib/nestledger";
import { formatShortDate } from "../../../constants/nestledger";
import ModernButton from "../../ui/ModernButton";
import ProgressBar from "../../ui/ProgressBar";
import { SPACE_TYPES } from "../nestledger.constants";
import { EmptyState, InfoPill } from "../nestledger.ui";
import type { SavingsMonthStats } from "../selectors";

type Props = {
	activeBudget: BudgetPlan | undefined;
	spent: number;
	shoppingItems: ShoppingItem[];
	shoppingBadgeCount: number;
	memberCount: number;
	unreadCount: number;
	savingsTrackerCount: number;
	currentMonthSavingsStatsMap: Record<string, SavingsMonthStats>;
	latestActivities: AppNotification[];
	isTablet: boolean;
	bentoWidth: number;
	c: (value: number) => string;
	migrationCardVisible: boolean;
	migrationSpaceType: SpaceType;
	actionBusy: boolean;
	onCreateBudget: () => void;
	onAnalyse: () => void;
	onNotifications: () => void;
	onMigrationSpaceTypeChange: (type: SpaceType) => void;
	onSaveMigration: () => Promise<void>;
	onDismissMigration: () => void;
};

export default function DashboardTab({
	activeBudget,
	spent,
	shoppingItems,
	shoppingBadgeCount,
	memberCount,
	unreadCount,
	savingsTrackerCount,
	currentMonthSavingsStatsMap,
	latestActivities,
	isTablet,
	bentoWidth,
	c,
	migrationCardVisible,
	migrationSpaceType,
	actionBusy,
	onCreateBudget,
	onAnalyse,
	onNotifications,
	onMigrationSpaceTypeChange,
	onSaveMigration,
	onDismissMigration,
}: Props) {
	const { theme } = useTheme();
	const styles = useStyles();
	const dashboardBalance = (activeBudget?.total_amount ?? 0) - spent;
	const pendingItemsCount = shoppingItems.filter((item) => !item.is_bought).length;
	return (
		<View style={styles.sectionGap}>
			<BentoCard tone="highlight">
				<Text style={styles.kicker}>Dashboard</Text>
				<Text style={styles.heroTitle}>
					{activeBudget?.name ?? "No budget yet"}
				</Text>
				<View style={styles.breakdownSummaryRow}>
					<View style={styles.breakdownStat}>
						<Text style={styles.breakdownStatValue}>
							{c(activeBudget?.total_amount ?? 0)}
						</Text>
						<Text style={styles.breakdownStatLabel}>Budget</Text>
					</View>
					<View style={styles.breakdownStat}>
						<Text style={styles.breakdownStatValue}>
							{c(spent)}
						</Text>
						<Text style={styles.breakdownStatLabel}>Spent</Text>
					</View>
					<View style={styles.breakdownStat}>
						<Text
							style={[
								styles.breakdownStatValue,
								{
						color: dashboardBalance >= 0 ? theme.success : theme.dangerText,
								},
							]}
						>
										{c(Math.abs(dashboardBalance))}
						</Text>
						<Text style={styles.breakdownStatLabel}>
							{dashboardBalance >= 0 ? "Remaining" : "Over budget by"}
						</Text>
					</View>
				</View>
				<View style={styles.spacer12} />
				<ProgressBar
					progress={
						activeBudget
							? spent /
								Math.max(activeBudget.total_amount, 1)
							: 0
					}
				/>
				{!activeBudget ? <ModernButton onPress={onCreateBudget} text="Create a budget" /> : null}
			</BentoCard>

			<Pressable
				onPress={onAnalyse}
				testID="open-analyse"
			>
				<BentoCard>
					<View style={styles.analyseCardRow}>
						<View style={styles.analyseCardIcon}>
							<Ionicons
								name="pie-chart-outline"
								size={22}
								color={theme.primary}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<Text style={styles.analyseCardTitle}>
								View full report
							</Text>
							<Text style={styles.bodyMuted}>
								See where your money went and how to spend less
								next month
							</Text>
						</View>
						<Ionicons
							name="chevron-forward"
							size={20}
							color={theme.textMuted}
						/>
					</View>
				</BentoCard>
			</Pressable>

			{migrationCardVisible ? (
				<BentoCard>
					<Text style={styles.inputLabel}>
						What kind of space is this?
					</Text>
					<Text style={styles.bodyMuted}>
						We&apos;ve added space types so NestLedger shows only
						what&apos;s relevant for you. Tap your type below.
					</Text>
					<View style={styles.spaceTypeGrid}>
						{SPACE_TYPES.map((st) => {
							const selected = migrationSpaceType === st.type;
							return (
								<Pressable
									key={st.type}
									onPress={() => onMigrationSpaceTypeChange(st.type)}
									style={[
										styles.spaceTypeCard,
										selected && styles.spaceTypeCardActive,
									]}
								>
									<Text style={styles.spaceTypeEmoji}>
										{st.emoji}
									</Text>
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
					<View style={styles.spacer12} />
						<ModernButton
							loading={actionBusy}
							onPress={onSaveMigration}
							testID="migration-card-save"
							text="Save space type"
							/>
					<ModernButton
						onPress={onDismissMigration}
						secondary
						testID="migration-card-dismiss"
						text="Remind me later"
					/>
				</BentoCard>
			) : null}

			<View
				style={[
					styles.bentoRow,
					isTablet && { justifyContent: "space-between" },
				]}
			>
				<BentoCard style={{ width: bentoWidth }}>
					<Text style={styles.cardEyebrow}>Current cycle</Text>
					<Text style={styles.metricText}>
						{c(spent)}
					</Text>
					<Text style={styles.bodyMuted}>
						spent ·{" "}
						{c(
						dashboardBalance >= 0 ? dashboardBalance : Math.abs(dashboardBalance),
						)}{" "}
		{dashboardBalance >= 0 ? "left" : "over budget"}
					</Text>
				</BentoCard>

				<BentoCard style={{ width: bentoWidth }}>
					<Text style={styles.cardEyebrow}>Shopping</Text>
					<Text style={styles.metricText}>
						{pendingItemsCount}
					</Text>
					<Text style={styles.bodyMuted}>
	pending shared items
					</Text>
					<View style={styles.statRow}>
						<InfoPill
							label="Bought"
							value={`${shoppingItems.filter((item) => item.is_bought).length}`}
						/>
						<InfoPill
							label="Unread"
							value={`${shoppingBadgeCount}`}
						/>
					</View>
				</BentoCard>

				<BentoCard style={{ width: bentoWidth }}>
					<Text style={styles.cardEyebrow}>Members</Text>
					<Text style={styles.metricText}>{memberCount}</Text>
					<Text style={styles.bodyMuted}>
						everyone sees updates in real time
					</Text>
				</BentoCard>

				<BentoCard style={{ width: bentoWidth }}>
					<Text style={styles.cardEyebrow}>Notifications</Text>
					<Text style={styles.metricText}>{unreadCount}</Text>
					<Text style={styles.bodyMuted}>
	unread space updates
					</Text>
				</BentoCard>

				<BentoCard style={{ width: bentoWidth }}>
					<Text style={styles.cardEyebrow}>Savings</Text>
					{savingsTrackerCount > 0 ? (
						<>
							<Text style={styles.metricText}>
								{c(
									Object.values(
										currentMonthSavingsStatsMap,
									).reduce((sum, s) => sum + s.balance, 0),
								)}
							</Text>
							<Text style={styles.bodyMuted}>
								total saved across all plans
							</Text>
						</>
					) : (
						<>
							<Text style={styles.metricText}>—</Text>
							<Text style={styles.bodyMuted}>
								No savings entries yet
							</Text>
						</>
					)}
				</BentoCard>
			</View>

			<BentoCard>
				<View style={styles.rowBetween}>
					<Text style={styles.sectionTitle}>Recent activity</Text>
					<Pressable onPress={onNotifications}>
						<Text style={styles.linkText}>Open all</Text>
					</Pressable>
				</View>
				{latestActivities.length > 0 ? (
					latestActivities.map((item) => (
						<View key={item.id} style={styles.listRow}>
							<Ionicons
								color={theme.primary}
								name="ellipse"
								size={10}
							/>
							<View style={{ flex: 1 }}>
								<Text style={styles.listTitle}>
									{item.message}
								</Text>
								<Text style={styles.listSubtitle}>
									{formatShortDate(item.created_at)}
								</Text>
							</View>
						</View>
					))
				) : (
					<EmptyState
						body="Notifications and shared actions will show here."
						title="No activity yet"
					/>
				)}
			</BentoCard>
		</View>
	);
}
