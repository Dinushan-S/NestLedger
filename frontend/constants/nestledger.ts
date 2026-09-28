export const theme = {
	background: "#F6F5F2",
	surface: "#FFFFFF",
	surfaceMuted: "#F9F9F8",
	primary: "#5D7B6F",
	onPrimary: "#FFFFFF",
	onDanger: "#2D1717",
	onSecondary: "#302019",
	primarySoft: "#E5EFE9",
	secondary: "#D99F89",
	secondarySoft: "#F5E3DD",
	text: "#2D312F",
	textMuted: "#6E7370",
	border: "#E5E5E0",
	success: "#8AB096",
	danger: "#D67C7C",
	dangerText: "#A33F3F",
	dangerSoft: "#F5E0E0",
	warning: "#E1B45C",
};

/** Dark-mode palette — hues stay consistent, values are shifted for dark backgrounds. */
export const darkTheme = {
	background: "#141716",
	surface: "#1E2220",
	surfaceMuted: "#242927",
	primary: "#7BA898",
	onPrimary: "#141716",
	onDanger: "#2D1717",
	onSecondary: "#302019",
	primarySoft: "#243530",
	secondary: "#D99F89",
	secondarySoft: "#3A2820",
	text: "#EBE9E4",
	textMuted: "#A5ADA7",
	border: "#2E3430",
	success: "#7AAB86",
	danger: "#D67C7C",
	dangerText: "#F09191",
	dangerSoft: "#3A2222",
	warning: "#E1B45C",
};

export const avatarChoices = ["🏡", "🪴", "🧺", "☕", "🧡", "🌿", "✨", "🐣"];

export const shoppingCategories = [
	"Groceries",
	"Household",
	"Personal Care",
	"Kitchen",
	"Electronics",
	"Stationery",
	"Other",
];

export const expenseCategories = [
	{ key: "Food & Dining", icon: "restaurant-outline" },
	{ key: "Transport", icon: "car-outline" },
	{ key: "Housing & Rent", icon: "home-outline" },
	{ key: "Utilities", icon: "flash-outline" },
	{ key: "Groceries", icon: "basket-outline" },
	{ key: "Clothing", icon: "shirt-outline" },
	{ key: "Healthcare", icon: "medkit-outline" },
	{ key: "Education", icon: "school-outline" },
	{ key: "Entertainment", icon: "game-controller-outline" },
	{ key: "Other", icon: "wallet-outline" },
];

export const shoppingFilters = ["All", "Pending", "Bought"] as const;
export const expenseFilters = ["Day", "Week", "Month"] as const;

// Hermes and trimmed ICU builds have no symbol for less common codes and echo the
// code back ("LKR 1,234"). True when the platform gave us a code, not a symbol.
const intlEchoedCode = (parts: Intl.NumberFormatPart[], code: string) =>
	parts.some((part) => part.type === "currency" && part.value === code);

// Number formatting follows the device locale; the currency code comes from the
// space. Intl already knows each ISO 4217 code's minor units, so only the
// overrides below are ours. Do not add a per-currency locale: that would force
// one country's grouping and separators onto every user.
export const formatCurrency = (value: number, currencyCode?: string | null) => {
	const code = (currencyCode || "USD").toUpperCase();
	const decimals = CURRENCY_INFO[code]?.decimals;
	if (!Number.isFinite(value)) value = 0;
	let parts: Intl.NumberFormatPart[];
	try {
		parts = new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: code,
			...(decimals === undefined
				? {}
				: { maximumFractionDigits: decimals, minimumFractionDigits: decimals }),
		}).formatToParts(value);
	} catch {
		// Only reachable for a malformed code; Intl does not throw on unknown ones.
		return `${CURRENCY_INFO[code]?.symbol ?? code} ${value.toLocaleString()}`;
	}
	// Fall back to our symbol only when the platform echoed the code, so a real
	// symbol from Intl ("CA$", "CLP$") is never second-guessed.
	const symbol = intlEchoedCode(parts, code) ? CURRENCY_INFO[code]?.symbol : undefined;
	return parts
		.map((part) => (symbol && part.type === "currency" ? symbol : part.value))
		.join("");
};

export const CURRENCY_INFO: Record<string, { symbol: string; decimals: number; name: string }> = {
	USD: { symbol: "$", decimals: 2, name: "US Dollar" },
	EUR: { symbol: "€", decimals: 2, name: "Euro" },
	GBP: { symbol: "£", decimals: 2, name: "British Pound" },
	JPY: { symbol: "¥", decimals: 0, name: "Japanese Yen" },
	CNY: { symbol: "¥", decimals: 2, name: "Chinese Yuan" },
	INR: { symbol: "₹", decimals: 2, name: "Indian Rupee" },
	LKR: { symbol: "Rs.", decimals: 0, name: "Sri Lankan Rupee" },
	AUD: { symbol: "A$", decimals: 2, name: "Australian Dollar" },
	CAD: { symbol: "C$", decimals: 2, name: "Canadian Dollar" },
	SGD: { symbol: "S$", decimals: 2, name: "Singapore Dollar" },
	MYR: { symbol: "RM", decimals: 2, name: "Malaysian Ringgit" },
	THB: { symbol: "฿", decimals: 2, name: "Thai Baht" },
	IDR: { symbol: "Rp", decimals: 0, name: "Indonesian Rupiah" },
	PHP: { symbol: "₱", decimals: 2, name: "Philippine Peso" },
	VND: { symbol: "₫", decimals: 0, name: "Vietnamese Dong" },
	KRW: { symbol: "₩", decimals: 0, name: "South Korean Won" },
	AED: { symbol: "د.إ", decimals: 2, name: "UAE Dirham" },
	SAR: { symbol: "﷼", decimals: 2, name: "Saudi Riyal" },
	QAR: { symbol: "﷼", decimals: 2, name: "Qatari Riyal" },
	KWD: { symbol: "د.ك", decimals: 3, name: "Kuwaiti Dinar" },
	BHD: { symbol: "د.ب", decimals: 3, name: "Bahraini Dinar" },
	OMR: { symbol: "﷼", decimals: 3, name: "Omani Rial" },
	CHF: { symbol: "Fr", decimals: 2, name: "Swiss Franc" },
	SEK: { symbol: "kr", decimals: 2, name: "Swedish Krona" },
	NOK: { symbol: "kr", decimals: 2, name: "Norwegian Krone" },
	DKK: { symbol: "kr", decimals: 2, name: "Danish Krone" },
	PLN: { symbol: "zł", decimals: 2, name: "Polish Zloty" },
	TRY: { symbol: "₺", decimals: 2, name: "Turkish Lira" },
	RUB: { symbol: "₽", decimals: 2, name: "Russian Ruble" },
	BRL: { symbol: "R$", decimals: 2, name: "Brazilian Real" },
	MXN: { symbol: "Mex$", decimals: 2, name: "Mexican Peso" },
	ZAR: { symbol: "R", decimals: 2, name: "South African Rand" },
	NZD: { symbol: "NZ$", decimals: 2, name: "New Zealand Dollar" },
	HKD: { symbol: "HK$", decimals: 2, name: "Hong Kong Dollar" },
	TWD: { symbol: "NT$", decimals: 2, name: "New Taiwan Dollar" },
	PKR: { symbol: "₨", decimals: 0, name: "Pakistani Rupee" },
	BDT: { symbol: "৳", decimals: 2, name: "Bangladeshi Taka" },
	NPR: { symbol: "₨", decimals: 0, name: "Nepalese Rupee" },
	EGP: { symbol: "£", decimals: 2, name: "Egyptian Pound" },
	NGN: { symbol: "₦", decimals: 2, name: "Nigerian Naira" },
	KES: { symbol: "KSh", decimals: 2, name: "Kenyan Shilling" },
	ILS: { symbol: "₪", decimals: 2, name: "Israeli Shekel" },
	COP: { symbol: "Col$", decimals: 2, name: "Colombian Peso" },
	CLP: { symbol: "CLP$", decimals: 0, name: "Chilean Peso" },
	ARS: { symbol: "AR$", decimals: 2, name: "Argentine Peso" },
	PEN: { symbol: "S/", decimals: 2, name: "Peruvian Sol" },
};

// Region -> currency for the onboarding default. The device locale's region is
// the closest thing to a location signal that needs no permission prompt, no IP
// lookup and no extra dependency. Users still choose their own currency.
export const REGION_CURRENCY: Record<string, string> = {
	AE: "AED", AR: "ARS", AU: "AUD", BD: "BDT", BR: "BRL", CA: "CAD",
	CH: "CHF", CL: "CLP", CN: "CNY", CO: "COP", DE: "EUR", DK: "DKK",
	EG: "EGP", ES: "EUR", FR: "EUR", GB: "GBP", HK: "HKD", ID: "IDR",
	IE: "EUR", IL: "ILS", IN: "INR", IT: "EUR", JP: "JPY", KE: "KES",
	KR: "KRW", KW: "KWD", LK: "LKR", MX: "MXN", MY: "MYR", NG: "NGN",
	NL: "EUR", NO: "NOK", NP: "NPR", NZ: "NZD", PE: "PEN", PH: "PHP",
	PK: "PKR", PL: "PLN", PT: "EUR", RU: "RUB", SA: "SAR", SE: "SEK",
	SG: "SGD", TH: "THB", TR: "TRY", TW: "TWD", US: "USD", VN: "VND",
	ZA: "ZAR",
};

export const defaultCurrencyForDevice = () => {
	try {
		const region = new Intl.DateTimeFormat()
			.resolvedOptions()
			.locale.split("-")[1]
			?.toUpperCase();
		return (region && REGION_CURRENCY[region]) || "USD";
	} catch {
		return "USD";
	}
};

// For a code we have not curated, ask the platform for its symbol. Keeps the
// picker readable for all the live codes, not just the 46 we ship overrides for.
export const symbolFor = (code: string): string => {
	const upper = code.toUpperCase();
	try {
		const parts = new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: upper,
		}).formatToParts(0);
		if (!intlEchoedCode(parts, upper)) {
			return parts.find((part) => part.type === "currency")!.value;
		}
	} catch {
		// Malformed code; fall through to the curated symbol.
	}
	return CURRENCY_INFO[upper]?.symbol ?? upper;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

// A stored "YYYY-MM-DD" is a calendar day with no timezone, but the language
// parses it as UTC midnight, which lands on the previous day for anyone west of
// UTC. Build it in local time instead so the day the user picked is the day shown.
export const parseDateOnly = (value: string): Date => {
	if (!DATE_ONLY_RE.test(value)) return new Date(value);
	const [year, month, day] = value.split("-").map(Number) as [number, number, number];
	return new Date(year, month - 1, day);
};

export const formatShortDate = (value?: string | null) => {
	if (!value) {
		return "—";
	}

	return parseDateOnly(value).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
};

export const startOfToday = () => {
	const date = new Date();
	date.setHours(0, 0, 0, 0);
	return date;
};

export const startOfWeek = () => {
	const date = startOfToday();
	const day = date.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	date.setDate(date.getDate() + diff);
	return date;
};

export const startOfMonth = () => {
	const date = startOfToday();
	date.setDate(1);
	return date;
};

/**
 * Returns the start of the current budget cycle for a plan.
 *
 * The cycle is anchored to the day-of-month of the plan's start_date.
 * Example: plan starts on June 10 → cycles run 10th→10th.
 *   - Today is June 14: cycle start = June 10
 *   - Today is June 5:  cycle start = May 10
 * Never returns a date earlier than the plan's actual start_date.
 */
export const getCycleStart = (planStartDate: string): Date => {
	const planStart = parseDateOnly(planStartDate);
	planStart.setHours(0, 0, 0, 0);
	const cycleDay = planStart.getDate(); // e.g. 10

	const now = new Date();
	const todayDay = now.getDate();

	let cycleStart: Date;
	if (todayDay >= cycleDay) {
		// Cycle started this calendar month
		cycleStart = new Date(
			now.getFullYear(),
			now.getMonth(),
			cycleDay,
			0,
			0,
			0,
			0,
		);
	} else {
		// Cycle started last calendar month
		cycleStart = new Date(
			now.getFullYear(),
			now.getMonth() - 1,
			cycleDay,
			0,
			0,
			0,
			0,
		);
	}

	// Never go before the plan's own start date
	return cycleStart < planStart ? planStart : cycleStart;
};

/**
 * Returns the {year, month} bucket (0-indexed month) that a given date's
 * budget cycle belongs to, anchored to anchorDay (day-of-month).
 * Same "day >= anchorDay ? this month : previous month" rule as getCycleStart,
 * generalized to any date rather than just "now".
 */
export const getCycleCursorForDate = (
	date: Date,
	anchorDay: number,
): { year: number; month: number } => {
	const day = date.getDate();
	if (day >= anchorDay) {
		return { year: date.getFullYear(), month: date.getMonth() };
	}
	const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
	return { year: prev.getFullYear(), month: prev.getMonth() };
};

/**
 * Returns the [start, end] Date range for a cycle cursor bucket, anchored to anchorDay.
 */
export const getCycleWindowForCursor = (
	year: number,
	month: number,
	anchorDay: number,
): { start: Date; end: Date } => {
	const start = new Date(year, month, anchorDay, 0, 0, 0, 0);
	const nextAnchor = new Date(year, month + 1, anchorDay, 0, 0, 0, 0);
	const end = new Date(nextAnchor.getTime() - 1);
	return { start, end };
};

const pad2 = (value: number) => String(value).padStart(2, "0");

// Local calendar date, NOT UTC. toISOString() would roll to tomorrow for anyone
// east of UTC after midday, and to yesterday for anyone west of UTC at night.
const localDateOf = (date: Date) =>
	`${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const todayLocalDate = () => localDateOf(new Date());

export const toLocalDate = (date: Date | string) =>
	typeof date === "string" ? date.slice(0, 10) : localDateOf(date);

export const monthNames = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

export const monthShort = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

export const billCategories = [
	{ key: "Electricity", icon: "flash-outline" },
	{ key: "Mobile", icon: "phone-portrait-outline" },
	{ key: "Water", icon: "water-outline" },
	{ key: "Gas", icon: "flame-outline" },
	{ key: "Internet", icon: "globe-outline" },
	{ key: "Insurance", icon: "shield-checkmark-outline" },
	{ key: "Rent", icon: "home-outline" },
	{ key: "Loan EMI", icon: "card-outline" },
	{ key: "Credit Card", icon: "card-outline" },
	{ key: "Other", icon: "receipt-outline" },
] as const;
