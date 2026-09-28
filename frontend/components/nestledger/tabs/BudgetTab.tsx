import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../lib/theme-context";
import { useStyles } from "../nestledger.styles";
import BentoCard from "../../ui/BentoCard";
import { Pressable, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import type { BillTrackerMeta, BudgetPlan, SavingsTrackerMeta } from "../../../lib/nestledger-services";
import { formatShortDate } from "../../../constants/nestledger";
import ModernButton from "../../ui/ModernButton";
import ProgressBar from "../../ui/ProgressBar";
import { EmptyState, InfoPill } from "../nestledger.ui";
import type { BillMonthStats, BudgetMonthStats, SavingsMonthStats } from "../selectors";

type Props = {
	plans: BudgetPlan[];
	billTrackers: BillTrackerMeta[];
	savingsTrackers: SavingsTrackerMeta[];
	currentMonthStatsMap: Record<string, BudgetMonthStats>;
	currentMonthBillStatsMap: Record<string, BillMonthStats>;
	currentMonthSavingsStatsMap: Record<string, SavingsMonthStats>;
	budgetEditMode: boolean;
	c: (value: number) => string;
	onToggleEditMode: () => void;
	onNewPlan: () => void;
	onSelectPlan: (id: string) => void;
	onEditBudget: (plan: BudgetPlan) => void;
	onDeleteBudget: (id: string, name: string) => void;
	onDeleteTracker: (type: "bill" | "savings", id: string, name: string) => void;
	onEditBillTracker: (tracker: BillTrackerMeta) => void;
	onSelectBillTracker: (id: string) => void;
	onEditSavingsTracker: (tracker: SavingsTrackerMeta) => void;
	onSelectSavingsTracker: (id: string) => void;
};

export default function BudgetTab({
	plans,
	billTrackers,
	savingsTrackers,
	currentMonthStatsMap,
	currentMonthBillStatsMap,
	currentMonthSavingsStatsMap,
	budgetEditMode,
	c,
	onToggleEditMode,
	onNewPlan,
	onSelectPlan,
	onEditBudget,
	onDeleteBudget,
	onDeleteTracker,
	onEditBillTracker,
	onSelectBillTracker,
	onEditSavingsTracker,
	onSelectSavingsTracker,
}: Props) {
	const { theme } = useTheme();
	const styles = useStyles();
	return (
		<View style={styles.sectionGap}>
			<View style={styles.headerBlock}>
				<View style={styles.headerContent}>
					<Text style={styles.sectionTitle}>Budget plans</Text>
					<Text style={styles.bodyMuted}>
						Track spend, remaining balance, and shared expenses.
					</Text>
				</View>
				<View style={styles.iconRow}>
					<Pressable
						hitSlop={8}
						onPress={onToggleEditMode}
						testID="budget-edit-mode-toggle"
					>
						<Ionicons
							color={
								budgetEditMode ? theme.primary : theme.textMuted
							}
							name={
								budgetEditMode
									? "checkmark-circle"
									: "settings-outline"
							}
							size={24}
						/>
					</Pressable>
					<ModernButton
						onPress={onNewPlan}
						secondary
						testID="budget-new-plan"
						text="New plan"
					/>
				</View>
			</View>

			{plans.map((plan) => {
				const stats = currentMonthStatsMap[plan.id] ?? {
					spent: 0,
					allocated: plan.total_amount,
					remaining: plan.total_amount,
				};
				return (
					<BentoCard key={plan.id} style={styles.planCard}>
						<View style={styles.rowBetween}>
							<Pressable
								onPress={() => onSelectPlan(plan.id)}
								style={{ flex: 1 }}
								testID={`budget-plan-${plan.id}`}
							>
								<Text style={styles.cardTitle}>{plan.name}</Text>
								<Text style={styles.bodyMuted}>
									{formatShortDate(plan.start_date)} →{" "}
									{formatShortDate(plan.end_date)}
								</Text>
							</Pressable>
							<View style={styles.iconRow}>
								{budgetEditMode ? (
									<>
										<Pressable
											hitSlop={8}
											onPress={() => onEditBudget(plan)}
											testID={`budget-edit-${plan.id}`}
										>
											<Ionicons
												color={theme.primary}
												name="create-outline"
												size={22}
											/>
										</Pressable>
										<Pressable
											hitSlop={8}
											onPress={() =>
												onDeleteBudget(plan.id, plan.name)
											}
											testID={`budget-delete-${plan.id}`}
										>
											<Ionicons
												color={theme.danger}
												name="trash-outline"
												size={22}
											/>
										</Pressable>
									</>
								) : null}
								<Pressable
									hitSlop={8}
									onPress={() => onSelectPlan(plan.id)}
								>
									<Ionicons
										color={theme.primary}
										name="chevron-forward-circle-outline"
										size={26}
									/>
								</Pressable>
							</View>
						</View>
						<View style={styles.statRow}>
							<InfoPill
								label="Allocated"
								value={c(stats.allocated)}
							/>
							<InfoPill label="Spent" value={c(stats.spent)} />
							<InfoPill label="Left" value={c(stats.remaining)} />
						</View>
						<ProgressBar
							progress={
								stats.spent / Math.max(stats.allocated, 1)
							}
						/>
					</BentoCard>
				);
			})}

			{plans.length === 0 ? (
				<EmptyState
	body="Create your first budget plan to start tracking expenses."
					title="No plans yet"
				/>
			) : null}

			{billTrackers.map((tracker) => {
				const bStats = currentMonthBillStatsMap[tracker.id] ?? {
					paid: 0,
					paidCount: 0,
					pending: 0,
					pendingCount: 0,
					totalCount: 0,
				};
				const renderRightActions = () => (
					<View style={styles.deleteAction}>
						<Pressable
							hitSlop={10}
							onPress={() =>
								onDeleteTracker(
									"bill",
									tracker.id,
									tracker.name,
								)
							}
							style={styles.deleteButton}
						>
							<Ionicons
								color={theme.onDanger}
								name="trash-outline"
								size={24}
							/>
						</Pressable>
					</View>
				);
				const renderLeftActions = () => (
					<View
						style={[
							styles.deleteAction,
							{ backgroundColor: theme.primary },
						]}
					>
						<Pressable
							hitSlop={10}
							onPress={() => onEditBillTracker(tracker)}
							style={styles.deleteButton}
						>
							<Ionicons
								color={theme.onPrimary}
								name="create-outline"
								size={24}
							/>
						</Pressable>
					</View>
				);
				return (
					<Swipeable
						key={tracker.id}
						renderLeftActions={renderLeftActions}
						renderRightActions={renderRightActions}
						overshootRight={false}
						overshootLeft={false}
					>
						<Pressable
							onPress={() => onSelectBillTracker(tracker.id)}
						>
							<BentoCard>
								<View style={styles.rowBetween}>
									<View style={{ flex: 1 }}>
										<Text style={styles.cardTitle}>
											{tracker.name}
										</Text>
										<Text style={styles.bodyMuted}>
											Bills this month: {bStats.totalCount}
										</Text>
									</View>
									<Ionicons
										color={theme.primary}
										name="chevron-forward-circle-outline"
										size={26}
									/>
								</View>
								<View style={styles.statRow}>
									<InfoPill label="Paid" value={c(bStats.paid)} />
									<InfoPill
										label="Pending"
										value={c(bStats.pending)}
									/>
									<InfoPill
										label="Total"
										value={`${bStats.totalCount} bills`}
									/>
								</View>
							</BentoCard>
						</Pressable>
					</Swipeable>
				);
			})}

			{savingsTrackers.map((tracker) => {
				const sStats = currentMonthSavingsStatsMap[
					tracker.id
				] ?? { balance: 0, deposits: 0, withdrawals: 0, net: 0 };
				const renderRightActions = () => (
					<View style={styles.deleteAction}>
						<Pressable
							hitSlop={10}
							onPress={() =>
								onDeleteTracker(
									"savings",
									tracker.id,
									tracker.name,
								)
							}
							style={styles.deleteButton}
						>
							<Ionicons
								color={theme.onDanger}
								name="trash-outline"
								size={24}
							/>
						</Pressable>
					</View>
				);
				const renderLeftActions = () => (
					<View
						style={[
							styles.deleteAction,
							{ backgroundColor: theme.primary },
						]}
					>
						<Pressable
							hitSlop={10}
							onPress={() => onEditSavingsTracker(tracker)}
							style={styles.deleteButton}
						>
							<Ionicons
								color={theme.onPrimary}
								name="create-outline"
								size={24}
							/>
						</Pressable>
					</View>
				);
				return (
					<Swipeable
						key={tracker.id}
						renderLeftActions={renderLeftActions}
						renderRightActions={renderRightActions}
						overshootRight={false}
						overshootLeft={false}
					>
						<Pressable
							onPress={() => onSelectSavingsTracker(tracker.id)}
						>
							<BentoCard>
								<View style={styles.rowBetween}>
									<Text style={styles.cardTitle}>
										{tracker.name}
									</Text>
									<Ionicons
										color={theme.primary}
										name="chevron-forward-circle-outline"
										size={26}
									/>
								</View>
								<View style={styles.statRow}>
									<InfoPill
										label="Balance"
										value={c(sStats.balance)}
									/>
									<InfoPill
										label="Deposits"
										value={c(sStats.deposits)}
									/>
									<InfoPill label="Net" value={c(sStats.net)} />
								</View>
							</BentoCard>
						</Pressable>
					</Swipeable>
				);
			})}

			{billTrackers.length === 0 &&
			savingsTrackers.length === 0 ? (
				<EmptyState
					body="Create your first bill or savings tracker to get started."
					title="No trackers yet"
				/>
			) : null}
		</View>
	);
}
