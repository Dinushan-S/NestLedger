import {
	avatarChoices,
	expenseCategories,
	expenseFilters,
} from "../../constants/nestledger";
import type { SpaceType } from "../../lib/nestledger-services";
import type { CreateProfileForm } from "./forms/ProfileFormControls";

// Form types + shared constants/helpers extracted from NestLedgerApp.tsx (2026-08-05).

export type BudgetForm = {
	endDate: string;
	name: string;
	startDate: string;
	totalAmount: string;
};

export type ExpenseFormItem = {
	name: string;
	price: string;
};

export type ExpenseForm = {
	category: string;
	customCategory: string;
	date: string;
	description: string;
	items: ExpenseFormItem[];
	is_borrow: boolean;
	paidBy: string | null;
	usedBy: string | null;
};

export type BorrowForm = {
	amount: string;
	date: string;
	description: string;
};

export type RepayForm = {
	amount: string;
	borrowId: string;
	date: string;
};

export type ShoppingForm = {
	category: string;
	name: string;
	quantity: string;
};

export const defaultCreateProfileForm: CreateProfileForm = {
	avatarEmoji: avatarChoices[0]!,
	currency: "USD",
	familyEmoji: avatarChoices[1]!,
	familyName: "",
	name: "",
	spaceType: "personal",
};

export const defaultBudgetForm = (): BudgetForm => {
	const today = new Date().toISOString().slice(0, 10);
	const nextMonth = new Date();
	nextMonth.setDate(nextMonth.getDate() + 30);

	return {
		endDate: nextMonth.toISOString().slice(0, 10),
		name: "",
		startDate: today,
		totalAmount: "",
	};
};

export const defaultExpenseForm = (): ExpenseForm => ({
	category: expenseCategories[0]!.key,
	customCategory: "",
	date: new Date().toISOString().slice(0, 10),
	description: "",
	items: [{ name: "", price: "" }],
	is_borrow: false,
	paidBy: null,
	usedBy: null,
});

export const defaultShoppingForm: ShoppingForm = {
	category: "",
	name: "",
	quantity: "",
};

export const defaultBudgetView = expenseFilters[1];

export const extractError = (error: unknown) => {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "object" && error !== null) {
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

	return "Something went wrong.";
};

export const isSchemaMissing = (message: string) => {
	const normalized = message.toLowerCase();
	return (
		normalized.includes("schema cache") ||
		normalized.includes("relation") ||
		normalized.includes("does not exist") ||
		normalized.includes("could not find the table")
	);
};

export const notificationTypes = {
	expense: "expense_added",
	join: "member_joined",
	shoppingAdded: "shopping_item_added",
	shoppingBought: "shopping_item_bought",
};

export const SPACE_TYPES: {
	type: SpaceType;
	emoji: string;
	label: string;
	desc: string;
}[] = [
	{
		type: "personal",
		emoji: "🙋",
		label: "Personal",
		desc: "Track your own spending. Add a partner anytime.",
	},
	{
		type: "family",
		emoji: "🏠",
		label: "Family / Home",
		desc: "Household budget shared with your family.",
	},
	{
		type: "trip_family",
		emoji: "✈️",
		label: "Family Trip",
		desc: "Travel budget for the whole family.",
	},
	{
		type: "trip_friends",
		emoji: "🧳",
		label: "Friend Trip",
		desc: "Trip with friends — track who paid what.",
	},
	{
		type: "shared_living",
		emoji: "🏡",
		label: "Shared Living",
		desc: "Friends sharing a house or flat.",
	},
];

export const spaceTypeName = (type?: string | null): string => {
	switch (type) {
		case "personal":
			return "Personal";
		case "family":
			return "Home";
		case "trip_family":
			return "Trip";
		case "trip_friends":
			return "Trip";
		case "shared_living":
			return "Shared Living";
		default:
			return "Space";
	}
};

// The profile row is the source of truth so this decision follows the user
// across phones. Device-local flags make a completed choice appear unfinished
// after signing in on a new device.
export const needsSpaceTypeMigration = (spaceType?: string | null) => !spaceType;

export const isSplitSpace = (type?: string | null) =>
	type === "trip_friends" || type === "shared_living";
