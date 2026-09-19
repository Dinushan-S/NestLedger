import { deriveExpenseSuggestions } from "./expenseSuggestions";
import type { ExpenseWithItems } from "@/lib/nestledger";

let sequence = 0;

const expense = (
	values: Partial<ExpenseWithItems> = {},
): ExpenseWithItems => {
	sequence += 1;
	return {
		added_by: "member-1",
		category: "Healthcare",
		created_at: "2026-09-01T08:00:00.000Z",
		date: "2026-09-01T08:00:00.000Z",
		description: null,
		id: `expense-${sequence}`,
		is_borrow: false,
		items: [
			{
				created_at: "2026-09-01T08:00:00.000Z",
				expense_id: `expense-${sequence}`,
				id: `item-${sequence}`,
				name: "Mothercare",
				price: 2000,
			},
		],
		paid_by: null,
		plan_id: "plan-1",
		price: 2000,
		profile_id: "profile-1",
		used_by: null,
		...values,
	};
};

describe("deriveExpenseSuggestions", () => {
	it("returns newest reusable expenses first and honors the configured limit", () => {
		const oldest = expense({
			date: "2026-09-01T08:00:00.000Z",
			items: [{ ...expense().items[0]!, name: "Oldest" }],
		});
		const newest = expense({
			date: "2026-09-03T08:00:00.000Z",
			items: [{ ...expense().items[0]!, name: "Newest" }],
		});
		const middle = expense({
			date: "2026-09-02T08:00:00.000Z",
			items: [{ ...expense().items[0]!, name: "Middle" }],
		});

		expect(deriveExpenseSuggestions([oldest, newest, middle], { limit: 2 }))
			.toEqual([newest, middle]);
	});

	it("keeps only the newest copy of the same reusable expense details", () => {
		const older = expense({
			date: "2026-09-01T08:00:00.000Z",
			description: "Monthly supplies",
		});
		const newer = expense({
			date: "2026-09-05T08:00:00.000Z",
			description: "Monthly supplies",
		});
		const distinctPayer = expense({
			date: "2026-09-06T08:00:00.000Z",
			description: "Monthly supplies",
			paid_by: "member-2",
		});

		expect(deriveExpenseSuggestions([older, newer, distinctPayer])).toEqual([
			distinctPayer,
			newer,
		]);
	});

	it("excludes borrow and repay records, even when their item details are valid", () => {
		const borrow = expense({ is_borrow: true, price: 1000 });
		const repay = expense({
			date: "2026-09-02T08:00:00.000Z",
			is_borrow: true,
			price: -1000,
		});
		const regularExpense = expense({
			date: "2026-09-03T08:00:00.000Z",
			items: [{ ...expense().items[0]!, name: "Pharmacy" }],
		});

		expect(deriveExpenseSuggestions([borrow, repay, regularExpense])).toEqual([
			regularExpense,
		]);
	});

	it("preserves a reusable multi-item expense intact", () => {
		const multiItemExpense = expense({
			items: [
				{ ...expense().items[0]!, name: "Diapers", price: 1800 },
				{ ...expense().items[0]!, name: "Wipes", price: 200 },
			],
			price: 2000,
		});

		expect(deriveExpenseSuggestions([multiItemExpense])).toEqual([
			multiItemExpense,
		]);
	});

	it("excludes expenses without complete, finite item details", () => {
		const missingName = expense({
			items: [{ ...expense().items[0]!, name: "  " }],
		});
		const invalidPrice = expense({
			items: [{ ...expense().items[0]!, price: Number.NaN }],
		});
		const noItems = expense({ items: [] });

		expect(deriveExpenseSuggestions([missingName, invalidPrice, noItems])).toEqual(
			[],
		);
	});
});
