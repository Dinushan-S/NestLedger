export type ReceiptConfidence = "high" | "medium" | "low";

export type ReceiptItemDraft = {
	id: string;
	name: string;
	quantity: number;
	unitPrice: number;
	totalPrice: number;
	confidence: ReceiptConfidence;
	rawText: string;
};

export type ParsedReceipt = {
	vendor: string | null;
	date: string | null;
	subtotal: number | null;
	total: number | null;
	items: ReceiptItemDraft[];
	warnings: string[];
	rawText: string;
};

export const categoryForReceiptVendor = (vendor: string | null) => {
	const normalized = vendor?.toLowerCase() ?? "";
	if (
		/(foodcity|food city|keells|cargills|arpico|carrefour|tesco|walmart)/i.test(
			normalized,
		)
	) {
		return "Groceries";
	}
	if (/(kfc|mcdonald|pizza hut|domino|burger king|starbucks)/i.test(normalized)) {
		return "Food & Dining";
	}
	return "Other";
};

export const formatReceiptItemName = (item: Pick<ReceiptItemDraft, "name" | "quantity">) =>
	item.quantity !== 1 ? `${item.name} × ${item.quantity}` : item.name;
