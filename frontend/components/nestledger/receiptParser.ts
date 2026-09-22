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

type NumericToken = {
	raw: string;
	value: number;
	start: number;
	end: number;
};

const KNOWN_VENDORS: { match: string; label: string }[] = [
	{ match: "cargills food city", label: "Cargills Food City" },
	{ match: "cargills", label: "Cargills Food City" },
	{ match: "cargill's", label: "Cargills Food City" },
	{ match: "food city", label: "Foodcity" },
	{ match: "foodcity", label: "Foodcity" },
	{ match: "kfc", label: "KFC" },
	{ match: "keells", label: "Keells" },
	{ match: "arpico", label: "Arpico" },
	{ match: "mcdonald", label: "McDonald's" },
	{ match: "pizza hut", label: "Pizza Hut" },
	{ match: "domino", label: "Domino's" },
	{ match: "burger king", label: "Burger King" },
	{ match: "starbucks", label: "Starbucks" },
	{ match: "carrefour", label: "Carrefour" },
	{ match: "tesco", label: "Tesco" },
	{ match: "walmart", label: "Walmart" },
];

const SUMMARY_LINE_RE =
	/\b(?:grand\s*total|total\s*(?:due|amount|payable|purchase)?|amount\s*due|net\s*total|subtotal|sub\s*total|tax|vat|discount|service\s*charge|change|cash|card|visa|master(?:card)?|tender|balance|round(?:ing)?|payment)\b/i;

const NON_ITEM_LINE_RE =
	/\b(?:receipt|invoice|bill\s*(?:no|number)|order\s*(?:no|number)|tel(?:ephone)?|phone|email|www\.|thank\s*you|welcome|served\s*by|cashier|table|terminal|auth(?:orization)?|transaction|date|time|qty|quantity|description|price|amount)\b/i;

const FOOTER_LINE_RE =
	/(?:\bsub\s*t[o0]t[a-z0-9]*\b|\bnet\s*t[o0]t[a-z0-9]*\b|\bgrand\s*t[o0]t[a-z0-9]*\b|\bround(?:ing)?\b|\btime\s*(?:e\s*)?end\b|\bplease\s+call\b|\bhot\s*line\b|\bhotline\b|\bitem\s*&\s*bill\s+within\b)/i;

const ITEM_HEADER_RE =
	/\b(?:item|description)\b.*\b(?:qty|quantity)\b.*\b(?:price|rate)\b.*\b(?:amount|total)\b/i;

const ITEM_SECTION_END_RE =
	/(?:\bsub\s*t[o0]t[a-z0-9]*\b|\bnet\s*t[o0]t[a-z0-9]*\b|\bgrand\s*t[o0]t[a-z0-9]*\b|\bamount\s*due\b|\btotal\s*(?:due|amount|payable|purchase)\b|\bround(?:ing)?\b|\btime\s*(?:e\s*)?end\b|\bplease\s+call\b|\bhot\s*line\b|\bhotline\b|\bitem\s*&\s*bill\s+within\b)/i;

const PRODUCT_CODE_RE = /^[*#]?\s*[A-Z]{1,5}\d{3,}\s*$/i;

const DIMENSION_RE =
	/\b\d+(?:[.,]\d+)?\s*\+\s*\d+(?:[.,]\d+)?\s*[xÃ—]\s*\d+(?:[.,]\d+)?\b/i;

const NUMBER_RE =
	/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?|\d+/g;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const normalizeLine = (line: string) =>
	line
		.replace(/[|]/g, " ")
		.replace(/[‐‑‒–—]/g, "-")
		.replace(/\s+/g, " ")
		.trim();

const parseMoneyToken = (raw: string) => {
	const cleaned = raw.replace(/\s/g, "");
	if (!cleaned) return Number.NaN;

	const lastDot = cleaned.lastIndexOf(".");
	const lastComma = cleaned.lastIndexOf(",");
	let normalized = cleaned;
	if (lastDot >= 0 && lastComma >= 0) {
		if (lastComma > lastDot) {
			normalized = cleaned.replace(/\./g, "").replace(",", ".");
		} else {
			normalized = cleaned.replace(/,/g, "");
		}
	} else if (lastComma >= 0) {
		const decimals = cleaned.length - lastComma - 1;
		normalized = decimals > 0 && decimals <= 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
	} else if (lastDot >= 0) {
		const decimals = cleaned.length - lastDot - 1;
		if (decimals === 3) normalized = cleaned.replace(/\./g, "");
	}

	return Number(normalized);
};

const extractNumericTokens = (line: string): NumericToken[] => {
	const tokens: NumericToken[] = [];
	for (const match of line.matchAll(NUMBER_RE)) {
		const raw = match[0];
		const start = match.index ?? 0;
		const end = start + raw.length;
		const before = line[start - 1];
		const after = line[end];
		// Do not mistake product codes such as 330ml or A12 for prices.
		if (/[A-Za-z]/.test(before ?? "") || /[A-Za-z]/.test(after ?? "")) continue;
		const value = parseMoneyToken(raw);
		if (Number.isFinite(value)) tokens.push({ raw, value, start, end });
	}
	return tokens;
};

const isQuantityCandidate = (value: number) =>
	Number.isFinite(value) && value > 0 && value <= 99;

const parseQuantityToken = (raw: string) => {
	const normalized = raw.replace(/\s/g, "");
	if (/^\d+[.,]\d{3}$/.test(normalized)) {
		return Number(normalized.replace(",", "."));
	}
	return parseMoneyToken(raw);
};

type NumberedItemGroup = {
	description: string;
	detailLines: string[];
};

const cleanDescriptionLine = (line: string) =>
	line
		.replace(/^\s*\d{1,3}[.)]?\s+/, "")
		.replace(/^\s*[*#]\s*/, "")
		.replace(/\s+/g, " ")
		.trim();

const groupNumberedItemLines = (lines: string[]) => {
	const groups: NumberedItemGroup[] = [];
	let current: NumberedItemGroup | null = null;

	for (const line of lines) {
		if (FOOTER_LINE_RE.test(line)) break;
		const numberedDescription = line.match(/^\s*\d{1,3}[.)]?\s+(.+)$/);
		if (
			numberedDescription &&
			/[A-Za-z]/.test(numberedDescription[1]!) &&
			!NON_ITEM_LINE_RE.test(numberedDescription[1]!)
		) {
			if (current) groups.push(current);
			current = {
				description: cleanDescriptionLine(numberedDescription[1]!),
				detailLines: [],
			};
			continue;
		}

		if (current) current.detailLines.push(line);
	}

	if (current) groups.push(current);
	return groups;
};

const parseNumberedItemGroup = (
	group: NumberedItemGroup,
	id: string,
): ReceiptItemDraft | null => {
	const detailText = group.detailLines.join(" ");
	const tokens = extractNumericTokens(detailText);
	if (tokens.length >= 3) {
		const quantityToken = tokens[tokens.length - 3]!;
		const unitPriceToken = tokens[tokens.length - 2]!;
		const totalPriceToken = tokens[tokens.length - 1]!;
		const quantity = parseQuantityToken(quantityToken.raw);
		const unitPrice = roundMoney(unitPriceToken.value);
		const totalPrice = roundMoney(totalPriceToken.value);

		if (
			group.description &&
			isQuantityCandidate(quantity) &&
			unitPrice > 0 &&
			totalPrice > 0
		) {
			return {
				id,
				name: group.description,
				quantity,
				unitPrice,
				totalPrice,
				confidence: "high",
				rawText: [group.description, ...group.detailLines].join("\n"),
			};
		}
	}

	const fallback = parseItemLine(
		[group.description, ...group.detailLines].join(" "),
		id,
	);
	if (fallback) fallback.name = group.description;
	return fallback;
};

const cleanItemName = (value: string) => {
	let name = value
		.replace(/^\s*[#]?\d{3,}\s+/, "")
		.replace(/^\s*[A-Z]{1,4}[-/]\d{3,}\s+/, "")
		.replace(/^\s*[\-:|]+|[\-:|]+\s*$/g, "")
		.replace(/\s+/g, " ")
		.trim();

	name = name
		.replace(/\b(?:rs\.?|lkr|usd|eur|gbp|inr)\s*$/i, "")
		.replace(/^\d+(?:[.,]\d+)?\s*[x×@]\s*/i, "")
		.replace(/\s*[x×]\s*\d+(?:[.,]\d+)?\s*$/i, "")
		.replace(/\s+\d+(?:[.,]\d+)?\s*[x×@]\s*\d+(?:[.,]\d+)?\s*$/i, "")
		.trim();

	return name.replace(/\s+/g, " ").trim();
};

const findVendor = (lines: string[]) => {
	const searchLines = lines.slice(0, 6).map((line) => line.toLowerCase());
	for (const vendor of KNOWN_VENDORS) {
		if (searchLines.some((line) => line.includes(vendor.match))) return vendor.label;
	}
	return null;
};

const parseReceiptDate = (lines: string[]) => {
	for (const line of lines) {
		const iso = line.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
		if (iso) {
			return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
		}
		const local = line.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
		if (local) {
			return `${local[3]}-${local[2]!.padStart(2, "0")}-${local[1]!.padStart(2, "0")}`;
		}
	}
	return null;
};

const parseItemLine = (line: string, id: string): ReceiptItemDraft | null => {
	if (FOOTER_LINE_RE.test(line)) return null;
	const tokens = extractNumericTokens(line);
	if (!tokens.length) return null;

	const totalToken = tokens[tokens.length - 1]!;
	const totalPrice = roundMoney(totalToken.value);
	if (!(totalPrice > 0)) return null;

	const body = line.slice(0, totalToken.start).trim();
	const explicitLeading = body.match(/^\s*(\d+(?:[.,]\d+)?)\s*[x×@]\s*(.*)$/i);
	const explicitSuffix = body.match(/^(.*?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*)$/i);
	const explicitSuffixWithUnit = body.match(
		/^(.*?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?)\s+(?:(?:rs\.?|lkr|usd|eur|gbp|inr)\s*)?\d+(?:[.,]\d+)?\s*)$/i,
	);
	const explicitMiddle = body.match(
		/^(.*?)(?:\s+)(\d+(?:[.,]\d+)?)\s*[x×@]\s*\d+(?:[.,]\d+)?\s*$/i,
	);

	let quantity = 1;
	let unitPrice = totalPrice;
	let nameSource = body;
	let confidence: ReceiptConfidence = "medium";

	if (explicitLeading) {
		quantity = parseMoneyToken(explicitLeading[1]!);
		nameSource = explicitLeading[2]!.trim();
		const unitToken = tokens[tokens.length - 2];
		const nameTokens = extractNumericTokens(nameSource);
		if (unitToken && nameTokens.length > 0) {
			const trailingUnit = nameTokens[nameTokens.length - 1]!;
			nameSource = nameSource.slice(0, trailingUnit.start).trim();
			unitPrice = roundMoney(unitToken.value);
		}
		confidence = "high";
	} else if (explicitMiddle) {
		quantity = parseMoneyToken(explicitMiddle[2]!);
		nameSource = explicitMiddle[1]!.trim();
		const unitToken = tokens[tokens.length - 2];
		unitPrice = unitToken ? roundMoney(unitToken.value) : roundMoney(totalPrice / quantity);
		confidence = "high";
	} else if (explicitSuffixWithUnit) {
		quantity = parseMoneyToken(explicitSuffixWithUnit[2]!);
		nameSource = explicitSuffixWithUnit[1]!.trim();
		const unitToken = tokens[tokens.length - 2];
		unitPrice = unitToken ? roundMoney(unitToken.value) : roundMoney(totalPrice / quantity);
		confidence = "high";
	} else if (explicitSuffix) {
		quantity = parseMoneyToken(explicitSuffix[2]!);
		nameSource = explicitSuffix[1]!.trim();
		confidence = "high";
	}

	if (quantity > 0 && quantity !== 1 && unitPrice === totalPrice) {
		unitPrice = roundMoney(totalPrice / quantity);
	}

	if (confidence !== "high") {
		const previous = tokens.length > 1 ? tokens[tokens.length - 2] : undefined;
		const beforePrevious = tokens.length > 2 ? tokens[tokens.length - 3] : undefined;
		const columnQuantity = beforePrevious
			? parseQuantityToken(beforePrevious.raw)
			: Number.NaN;
		if (beforePrevious && previous && isQuantityCandidate(columnQuantity)) {
			quantity = columnQuantity;
			unitPrice = roundMoney(previous.value);
			nameSource = line.slice(0, beforePrevious.start).trim();
			confidence = "high";
		} else if (previous && isQuantityCandidate(previous.value)) {
			quantity = previous.value;
			unitPrice = roundMoney(totalPrice / quantity);
			nameSource = line.slice(0, previous.start).trim();
			confidence = "medium";
		} else {
			nameSource = body;
		}
	}

	const name = cleanItemName(nameSource);
	if (!name || name.length < 2 || !/[A-Za-z]/.test(name)) return null;
	if (SUMMARY_LINE_RE.test(name) || NON_ITEM_LINE_RE.test(name)) return null;

	return {
		id,
		name,
		quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
		unitPrice: Number.isFinite(unitPrice) && unitPrice > 0 ? roundMoney(unitPrice) : totalPrice,
		totalPrice,
		confidence,
		rawText: line,
	};
};

const summaryValue = (line: string) => {
	const tokens = extractNumericTokens(line);
	const last = tokens[tokens.length - 1];
	return last && last.value > 0 ? roundMoney(last.value) : null;
};

const dedupeItems = (items: ReceiptItemDraft[]) => {
	const seen = new Set<string>();
	return items.filter((item) => {
		const key = `${item.name.toLowerCase()}|${item.quantity}|${item.totalPrice}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

/**
 * Convert OCR text into a conservative, editable receipt draft.
 *
 * Receipt layouts vary significantly, so this parser deliberately returns
 * confidence and warnings instead of silently treating every numeric line as
 * a confirmed expense item.
 */
export function parseReceiptText(rawText: string): ParsedReceipt {
	const raw = rawText.trim();
	const lines = raw
		.split(/\r?\n/)
		.map(normalizeLine)
		.filter(Boolean);
	const vendor = findVendor(lines);
	const date = parseReceiptDate(lines);
	const warnings: string[] = [];

	let subtotal: number | null = null;
	let receiptTotal: number | null = null;
	for (const line of lines) {
		if (/\bsub\s*t[o0]t[a-z0-9]*\b/i.test(line)) subtotal = summaryValue(line);
		if (
			/\b(?:grand\s*total|total\s*(?:due|amount|payable|purchase)?|amount\s*due|net\s*total)\b/i.test(
				line,
			)
		) {
			receiptTotal = summaryValue(line) ?? receiptTotal;
		}
	}

	const itemHeaderIndex = lines.findIndex((line) => ITEM_HEADER_RE.test(line));
	const itemSectionStart = itemHeaderIndex >= 0 ? itemHeaderIndex + 1 : 0;
	const relativeItemSectionEnd = lines
		.slice(itemSectionStart)
		.findIndex((line) => ITEM_SECTION_END_RE.test(line));
	const itemSectionEnd =
		relativeItemSectionEnd >= 0
			? itemSectionStart + relativeItemSectionEnd
			: lines.length;
	const itemLines = lines.slice(itemSectionStart, itemSectionEnd);
	const parsedItems: ReceiptItemDraft[] = [];
	let pendingDescription: string | null = null;
	const numberedItemGroups =
		itemHeaderIndex >= 0 ? groupNumberedItemLines(itemLines) : [];

	if (numberedItemGroups.length) {
		for (const [index, group] of numberedItemGroups.entries()) {
			const item = parseNumberedItemGroup(group, `receipt-item-${index + 1}`);
			if (item) parsedItems.push(item);
		}
	}

	for (const [index, line] of numberedItemGroups.length ? [] : itemLines.entries()) {
		if (SUMMARY_LINE_RE.test(line)) continue;

		const dimensionDescription = DIMENSION_RE.test(line);
		const parsedItem = dimensionDescription
			? null
			: parseItemLine(line, `receipt-item-${index + 1}`);

		if (!parsedItem) {
			const description = cleanDescriptionLine(line);
			if (
				description &&
				/[A-Za-z]/.test(description) &&
				!NON_ITEM_LINE_RE.test(description)
			) {
				pendingDescription = pendingDescription
					? `${pendingDescription} ${description}`
					: description;
			}
			continue;
		}

		if (pendingDescription && PRODUCT_CODE_RE.test(parsedItem.name)) {
			parsedItem.name = pendingDescription;
			parsedItem.rawText = `${pendingDescription}\n${line}`;
		}
		pendingDescription = null;
		parsedItems.push(parsedItem);
	}

	const items = dedupeItems(parsedItems);

	const lineTotal = roundMoney(items.reduce((sum, item) => sum + item.totalPrice, 0));
	if (!items.length) {
		warnings.push("No item rows were recognized. Retake the photo with the receipt flat and well lit.");
	}
	if (receiptTotal === null && lineTotal > 0) {
		receiptTotal = lineTotal;
		warnings.push("The receipt total was not found, so it was calculated from the recognized items.");
	}
	if (receiptTotal !== null && lineTotal > 0 && Math.abs(receiptTotal - lineTotal) > 0.02) {
		warnings.push(
			`The line items add up to ${lineTotal.toFixed(2)}, but the printed total is ${receiptTotal.toFixed(2)}. Check tax, discounts, and quantities.`,
		);
	}
	if (items.some((item) => item.confidence === "medium")) {
		warnings.push("Some quantities were inferred from the receipt layout. Review them before saving.");
	}
	if (!vendor) warnings.push("Store name was not recognized. Add it to the description if needed.");

	return {
		vendor,
		date,
		subtotal,
		total: receiptTotal,
		items,
		warnings,
		rawText: raw,
	};
}

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
