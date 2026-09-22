import type { ExpenseItem, ExpenseWithItems } from "@/lib/nestledger";
import { expenseCategories } from "../../constants/nestledger";
import type { ExpenseForm } from "./nestledger.constants";

export const DEFAULT_EXPENSE_SUGGESTION_LIMIT = 6;

export type ExpenseSuggestionOptions = {
	limit?: number;
};

export type RecentExpenseItemSuggestion = {
	category: string;
	name: string;
	price: number;
};

/**
 * Applies a selected recent item match to one row in the expense draft.
 */
export function applyRecentItemSuggestionToExpenseForm(
	form: ExpenseForm,
	index: number,
	suggestion: RecentExpenseItemSuggestion,
): ExpenseForm {
	const isKnownCategory = expenseCategories.some(
		(category) => category.key === suggestion.category && category.key !== "Other",
	);

	return {
		...form,
		category: isKnownCategory ? suggestion.category : "Other",
		customCategory: isKnownCategory ? "" : suggestion.category,
		items: form.items.map((item, itemIndex) =>
			itemIndex === index
				? {
						...item,
						name: suggestion.name,
						price: item.price.trim() ? item.price : String(suggestion.price),
					}
				: item,
		),
	};
}

/**
 * Returns recent expense records that are safe to reuse in the add-expense
 * form. Suggestions are source records, rather than clones, so callers can
 * decide exactly which fields to copy into a new draft.
 */
export function deriveExpenseSuggestions(
	expenses: readonly ExpenseWithItems[],
	options: ExpenseSuggestionOptions = {},
): ExpenseWithItems[] {
	const limit = normaliseLimit(options.limit);
	if (limit === 0) {
		return [];
	}

	const newestFirst = expenses
		.map((expense, index) => ({ expense, index }))
		.filter(({ expense }) => isReusableExpense(expense))
		.sort((left, right) => {
			const dateDifference = reusableDate(right.expense) - reusableDate(left.expense);
			if (dateDifference !== 0) {
				return dateDifference;
			}

			return left.index - right.index;
		});

	const seen = new Set<string>();
	const suggestions: ExpenseWithItems[] = [];
	for (const { expense } of newestFirst) {
		const key = reusableExpenseKey(expense);
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		suggestions.push(expense);
		if (suggestions.length === limit) {
			break;
		}
	}

	return suggestions;
}

/**
 * Finds recent item names for the item-name autocomplete. Results only appear
 * after the person has typed something, so the expense form stays quiet until
 * the suggestion is useful.
 */
export function deriveRecentExpenseItemSuggestions(
	expenses: readonly ExpenseWithItems[],
	query: string,
	limit = 4,
): RecentExpenseItemSuggestion[] {
	const normalizedQuery = normalizeItemName(query);
	if (!normalizedQuery || limit <= 0) {
		return [];
	}

	const seenNames = new Set<string>();
	const suggestions: RecentExpenseItemSuggestion[] = [];
	for (const expense of deriveExpenseSuggestions(expenses, {
		limit: Number.MAX_SAFE_INTEGER,
	})) {
		for (const item of expense.items) {
			const normalizedName = normalizeItemName(item.name);
			if (
				!normalizedName.includes(normalizedQuery) ||
				seenNames.has(normalizedName)
			) {
				continue;
			}

			seenNames.add(normalizedName);
			suggestions.push({
				category: expense.category,
				name: item.name.trim(),
				price: item.price,
			});
			if (suggestions.length === limit) {
				return suggestions;
			}
		}
	}

	return suggestions;
}

function isReusableExpense(expense: ExpenseWithItems): boolean {
	return !expense.is_borrow && expense.items.length > 0 && expense.items.every(isValidItem);
}

function isValidItem(item: ExpenseItem): boolean {
	return item.name.trim().length > 0 && Number.isFinite(item.price);
}

function normalizeItemName(value: string): string {
	return value.trim().toLocaleLowerCase();
}

function reusableDate(expense: ExpenseWithItems): number {
	const expenseDate = Date.parse(expense.date);
	if (Number.isFinite(expenseDate)) {
		return expenseDate;
	}

	const createdAt = Date.parse(expense.created_at);
	return Number.isFinite(createdAt) ? createdAt : 0;
}

function reusableExpenseKey(expense: ExpenseWithItems): string {
	const items = expense.items
		.map((item) => [item.name.trim(), item.price] as const)
		.sort(([leftName, leftPrice], [rightName, rightPrice]) => {
			const nameComparison = leftName.localeCompare(rightName);
			return nameComparison !== 0 ? nameComparison : leftPrice - rightPrice;
		});

	return JSON.stringify({
		category: expense.category,
		description: expense.description ?? null,
		items,
		paidBy: expense.paid_by ?? null,
		usedBy: expense.used_by ?? null,
	});
}

function normaliseLimit(limit: number | undefined): number {
	if (limit === undefined) {
		return DEFAULT_EXPENSE_SUGGESTION_LIMIT;
	}

	if (!Number.isFinite(limit)) {
		return DEFAULT_EXPENSE_SUGGESTION_LIMIT;
	}

	return Math.max(0, Math.floor(limit));
}
