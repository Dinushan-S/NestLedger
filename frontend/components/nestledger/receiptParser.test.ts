import {
	categoryForReceiptVendor,
	formatReceiptItemName,
	parseReceiptText,
} from "./receiptParser";

describe("parseReceiptText", () => {
	it("parses a Foodcity receipt with explicit quantities and totals", () => {
		const parsed = parseReceiptText(`
FOOD CITY - NUGEGODA
Date: 19/09/2026
MILK 1L 350.00
APPLES 2 x 250.00 500.00
SUB TOTAL 850.00
TOTAL 850.00
`);

		expect(parsed.vendor).toBe("Foodcity");
		expect(parsed.date).toBe("2026-09-19");
		expect(parsed.items).toEqual([
			expect.objectContaining({
				name: "MILK 1L",
				quantity: 1,
				unitPrice: 350,
				totalPrice: 350,
			}),
			expect.objectContaining({
				name: "APPLES",
				quantity: 2,
				unitPrice: 250,
				totalPrice: 500,
			}),
		]);
		expect(parsed.subtotal).toBe(850);
		expect(parsed.total).toBe(850);
		expect(parsed.warnings).not.toContain(
			"The receipt total was not found, so it was calculated from the recognized items.",
		);
	});

	it("handles a KFC receipt with a quantity, unit price, and line total", () => {
		const parsed = parseReceiptText(`
KFC COLOMBO
CHICKEN BURGER 2 850.00 1,700.00
FRIES 1 x 450.00
TOTAL 2,150.00
`);

		expect(parsed.vendor).toBe("KFC");
		expect(parsed.items[0]).toEqual(
			expect.objectContaining({
				name: "CHICKEN BURGER",
				quantity: 2,
				unitPrice: 850,
				totalPrice: 1700,
			}),
		);
		expect(parsed.items[1]).toEqual(
			expect.objectContaining({
				name: "FRIES",
				quantity: 1,
				unitPrice: 450,
				totalPrice: 450,
			}),
		);
		expect(parsed.total).toBe(2150);
		expect(parsed.warnings).toContain(
			"Some quantities were inferred from the receipt layout. Review them before saving.",
		);
	});

	it("calculates a missing total from recognized line items", () => {
		const parsed = parseReceiptText(`
LOCAL SHOP
COFFEE 2 200.00 400.00
TEA 150.00
`);

		expect(parsed.total).toBe(550);
		expect(parsed.warnings).toContain(
			"The receipt total was not found, so it was calculated from the recognized items.",
		);
	});

	it("does not treat dates, totals, or payment rows as products", () => {
		const parsed = parseReceiptText(`
KFC
Date 19/09/2026 20:10
CHICKEN 1 x 950.00
SUBTOTAL 950.00
VAT 0.00
GRAND TOTAL 950.00
CASH 1,000.00
CHANGE 50.00
`);

		expect(parsed.items).toHaveLength(1);
		expect(parsed.items[0]!.name).toBe("CHICKEN");
	});

	it("never treats hotline and receipt footer text as items without a table header", () => {
		const parsed = parseReceiptText(`
LOCAL SHOP
COFFEE 450.00
Sub Totai 450.00
Time e End 08 56 14
the item & bill within 7
Please call our hotline 0117 181
`);

		expect(parsed.items).toHaveLength(1);
		expect(parsed.items[0]).toEqual(
			expect.objectContaining({ name: "COFFEE", totalPrice: 450 }),
		);
	});

	it("supports suffix quantities and currency-prefixed prices", () => {
		const parsed = parseReceiptText(`
FOODCITY
APPLES x2 Rs 250.00 500.00
TOTAL Rs 500.00
`);

		expect(parsed.items[0]).toEqual(
			expect.objectContaining({
				name: "APPLES",
				quantity: 2,
				unitPrice: 250,
				totalPrice: 500,
			}),
		);
	});

	it("parses split Cargills item rows and ignores receipt footer numbers", () => {
		const parsed = parseReceiptText(`
CARGILLS FOOD CITY
22/09/2026 08:58:14
NO ITEM QTY PRICE AMOUNT
1 KHAO SHONG COFFEE BOTTLE
BV56011 1.000 1,230.00
1,045.50
2 USA RED APPLE
FT30137 0.542
2,600.00
1,409.20
3 HANDLE BAG LARGE LDPE 12+5x20
PME0536 1.000 5.00
5.00
Sub Total 2,459.70
Rounding Off -0.20
Net Total 2,459.50
Time End 08 56 14
the item & bill within 7
Please call our hotline 0117 181
`);

		expect(parsed.vendor).toBe("Cargills Food City");
		expect(parsed.subtotal).toBe(2459.7);
		expect(parsed.items).toEqual([
			expect.objectContaining({
				name: "KHAO SHONG COFFEE BOTTLE",
				quantity: 1,
				unitPrice: 1230,
				totalPrice: 1045.5,
			}),
			expect.objectContaining({
				name: "USA RED APPLE",
				quantity: 0.542,
				unitPrice: 2600,
				totalPrice: 1409.2,
			}),
			expect.objectContaining({
				name: "HANDLE BAG LARGE LDPE 12+5x20",
				quantity: 1,
				unitPrice: 5,
				totalPrice: 5,
			}),
		]);
		expect(parsed.total).toBe(2459.5);
		expect(parsed.items.map((item) => item.name)).not.toEqual(
			expect.arrayContaining([
				"Time End",
				"the item & bill within",
				"Please call our hotline",
			]),
		);
	});
});

describe("receipt helpers", () => {
	it("maps common vendors to useful categories", () => {
		expect(categoryForReceiptVendor("Foodcity")).toBe("Groceries");
		expect(categoryForReceiptVendor("KFC")).toBe("Food & Dining");
		expect(categoryForReceiptVendor(null)).toBe("Other");
	});

	it("keeps quantity visible when the existing expense schema is used", () => {
		expect(formatReceiptItemName({ name: "Chicken Burger", quantity: 2 })).toBe(
			"Chicken Burger × 2",
		);
		expect(formatReceiptItemName({ name: "Tomatoes", quantity: 0.5 })).toBe(
			"Tomatoes × 0.5",
		);
		expect(formatReceiptItemName({ name: "Coffee", quantity: 1 })).toBe("Coffee");
	});
});
