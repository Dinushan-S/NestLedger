import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../lib/theme-context";
import { useStyles } from "../nestledger.styles";
import BentoCard from "../../ui/BentoCard";
import { Pressable, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import type { ShoppingItem } from "../../../lib/nestledger";
import { formatShortDate, shoppingFilters } from "../../../constants/nestledger";
import CategoryChip from "../../ui/CategoryChip";
import ModernButton from "../../ui/ModernButton";
import { EmptyState } from "../nestledger.ui";
import type { MemberSummary } from "../selectors";

type Props = {
	filteredShoppingItems: ShoppingItem[];
	shoppingFilter: (typeof shoppingFilters)[number];
	memberMap: Map<string, MemberSummary>;
	onAddItem: () => void;
	onFilterChange: (filter: (typeof shoppingFilters)[number]) => void;
	onClearBought: () => void;
	onDeleteItem: (id: string, name: string) => void;
	onMarkBought: (item: ShoppingItem) => void;
};

export default function ShoppingTab({
	filteredShoppingItems,
	shoppingFilter,
	memberMap,
	onAddItem,
	onFilterChange,
	onClearBought,
	onDeleteItem,
	onMarkBought,
}: Props) {
	const { theme } = useTheme();
	const styles = useStyles();
	return (
		<View style={styles.sectionGap}>
			<View style={styles.headerBlock}>
				<View style={styles.headerContent}>
					<Text style={styles.sectionTitle}>Shopping list</Text>
					<Text style={styles.bodyMuted}>
						Shared in real time with bought timestamps and member
						names.
					</Text>
				</View>
				<ModernButton
					onPress={onAddItem}
					secondary
					testID="shopping-open-add"
					text="Add item"
				/>
			</View>

			<View style={styles.segmentRow}>
				{shoppingFilters.map((filter) => (
					<CategoryChip
						key={filter}
						active={shoppingFilter === filter}
						label={filter}
						onPress={() => onFilterChange(filter)}
					/>
				))}
			</View>

			<Pressable
				hitSlop={10}
				onPress={onClearBought}
			>
				<Text style={styles.linkText}>
					Clear all bought items
				</Text>
			</Pressable>

			{filteredShoppingItems.length > 0 ? (
				filteredShoppingItems.map((item) => {
					const actor = memberMap.get(
						item.bought_by ?? item.added_by,
					);
					const renderRightActions = () => (
						<View style={styles.deleteAction}>
							<Pressable
								hitSlop={10}
								onPress={() =>
									onDeleteItem(item.id, item.name)
								}
								style={styles.deleteButton}
								testID={`shopping-delete-${item.id}`}
							>
								<Ionicons
									color={theme.onDanger}
									name="trash-outline"
									size={24}
								/>
							</Pressable>
						</View>
					);
					return (
						<Swipeable
							key={item.id}
							renderRightActions={renderRightActions}
							overshootRight={false}
						>
							<BentoCard style={styles.shoppingCard}>
								<View style={styles.rowBetween}>
									<View style={{ flex: 1 }}>
										<Text
											style={[
												styles.listTitle,
												item.is_bought && styles.strikethrough,
											]}
										>
											{item.name}
										</Text>
										<Text style={styles.listSubtitle}>
											{item.quantity ? `${item.quantity} • ` : ""}
											{item.category || "General"}
										</Text>
										<Text style={styles.listSubtitle}>
											Added by{" "}
											{memberMap.get(item.added_by)?.name ??
												"Member"}
											{item.is_bought
												? ` • Bought by ${actor?.name ?? "Member"} on ${formatShortDate(item.bought_at)}`
												: ""}
										</Text>
									</View>
									<Pressable
										hitSlop={12}
										onPress={() => onMarkBought(item)}
										testID={`shopping-mark-bought-${item.id}`}
									>
										<Ionicons
											color={
												item.is_bought
													? theme.success
													: theme.primary
											}
											name={
												item.is_bought
													? "checkmark-circle"
													: "checkmark-circle-outline"
											}
											size={28}
										/>
									</Pressable>
								</View>
							</BentoCard>
						</Swipeable>
					);
				})
			) : (
				<EmptyState
	body="Add shared items so everyone can see and update them together."
					title="List is empty"
				/>
			)}
		</View>
	);
}
