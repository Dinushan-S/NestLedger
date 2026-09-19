import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { expenseCategories, formatCurrency, theme } from "../../constants/nestledger";
import type { RecurringExpense } from "../../lib/nestledger";
import { BottomSheet } from "../ui/BottomSheet";
import CategoryChip from "../ui/CategoryChip";
import ModernButton from "../ui/ModernButton";

type Draft = {
	amount: string;
	category: string;
	dueDate: string;
	frequency: RecurringExpense["frequency"];
	name: string;
};

const newDraft = (): Draft => ({
	amount: "",
	category: expenseCategories[0]!.key,
	dueDate: new Date().toISOString().slice(0, 10),
	frequency: "monthly",
	name: "",
});

type Props = {
	actionBusy: boolean;
	currencyCode: string;
	onClose: () => void;
	onCreate: (input: Omit<RecurringExpense, "created_at" | "id" | "updated_at">) => void;
	onDelete: (expense: RecurringExpense) => void;
	onUse: (expense: RecurringExpense) => void;
	profileId: string;
	userId: string;
	visible: boolean;
	expenses: RecurringExpense[];
};

export function RecurringExpensesSheet({
	actionBusy,
	currencyCode,
	onClose,
	onCreate,
	onDelete,
	onUse,
	profileId,
	userId,
	visible,
	expenses,
}: Props) {
	const [draft, setDraft] = useState(newDraft());
	const create = () => {
		const amount = Number(draft.amount);
		if (!draft.name.trim() || !Number.isFinite(amount) || amount <= 0 || !draft.dueDate) return;
		onCreate({
			category: draft.category,
			created_by: userId,
			description: null,
			frequency: draft.frequency,
			is_active: true,
			items: [{ name: draft.name.trim(), price: amount }],
			name: draft.name.trim(),
			next_due_date: draft.dueDate,
			profile_id: profileId,
			reminder_time: "09:00",
		});
		setDraft(newDraft());
	};

	return (
		<Modal animationType="slide" transparent visible={visible}>
			<BottomSheet onClose={onClose}>
				<Text style={styles.title}>Scheduled expenses</Text>
				<Text style={styles.hint}>On the due date, you will confirm and can edit the expense before it is saved.</Text>

				<View style={styles.form}>
					<TextInput onChangeText={(name) => setDraft((current) => ({ ...current, name }))} placeholder="Expense name" style={styles.input} value={draft.name} />
					<TextInput keyboardType="numeric" onChangeText={(amount) => setDraft((current) => ({ ...current, amount }))} placeholder={`Amount (${currencyCode})`} style={styles.input} value={draft.amount} />
					<TextInput onChangeText={(dueDate) => setDraft((current) => ({ ...current, dueDate }))} placeholder="First due date (YYYY-MM-DD)" style={styles.input} value={draft.dueDate} />
					<Text style={styles.label}>Category</Text>
					<View style={styles.chips}>{expenseCategories.map((category) => <CategoryChip key={category.key} active={draft.category === category.key} label={category.key} onPress={() => setDraft((current) => ({ ...current, category: category.key }))} />)}</View>
					<Text style={styles.label}>Repeats</Text>
					<View style={styles.chips}>{(["daily", "weekly", "monthly", "yearly"] as const).map((frequency) => <CategoryChip key={frequency} active={draft.frequency === frequency} label={frequency[0]!.toUpperCase() + frequency.slice(1)} onPress={() => setDraft((current) => ({ ...current, frequency }))} />)}</View>
					<ModernButton loading={actionBusy} onPress={create} text="Schedule expense" />
				</View>

				{expenses.map((expense) => (
					<View key={expense.id} style={styles.card}>
						<View style={styles.cardContent}>
							<Text style={styles.cardTitle}>{expense.name}</Text>
							<Text style={styles.meta}>{expense.category} · {expense.frequency} · due {expense.next_due_date}</Text>
							<Text style={styles.meta}>{formatCurrency(expense.items.reduce((sum, item) => sum + item.price, 0), currencyCode)}</Text>
						</View>
						<Pressable hitSlop={10} onPress={() => onUse(expense)} style={styles.iconButton}><Ionicons color={theme.primary} name="play-circle-outline" size={28} /></Pressable>
						<Pressable hitSlop={10} onPress={() => onDelete(expense)} style={styles.iconButton}><Ionicons color={theme.danger} name="trash-outline" size={22} /></Pressable>
					</View>
				))}
			</BottomSheet>
		</Modal>
	);
}

const styles = StyleSheet.create({
	card: { alignItems: "center", backgroundColor: theme.surfaceMuted, borderColor: theme.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 8, padding: 12 },
	cardContent: { flex: 1, gap: 3 },
	cardTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	form: { gap: 10, marginTop: 16 },
	hint: { color: theme.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
	iconButton: { padding: 4 },
	input: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 12, borderWidth: 1, color: theme.text, fontSize: 15, minHeight: 46, paddingHorizontal: 12 },
	label: { color: theme.text, fontSize: 14, fontWeight: "700", marginTop: 4 },
	meta: { color: theme.textMuted, fontSize: 12 },
	title: { color: theme.text, fontSize: 22, fontWeight: "800" },
});
