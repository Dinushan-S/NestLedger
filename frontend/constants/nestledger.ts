export const theme = {
	background: "#F6F5F2",
	surface: "#FFFFFF",
	surfaceMuted: "#F9F9F8",
	primary: "#5D7B6F",
	primarySoft: "#E5EFE9",
	secondary: "#D99F89",
	secondarySoft: "#F5E3DD",
	text: "#2D312F",
	textMuted: "#6E7370",
	border: "#E5E5E0",
	success: "#8AB096",
	danger: "#D67C7C",
	dangerSoft: "#F5E0E0",
	warning: "#E1B45C",
};

/** Dark-mode palette — hues stay consistent, values are shifted for dark backgrounds. */
export const darkTheme = {
	background: "#141716",
	surface: "#1E2220",
	surfaceMuted: "#242927",
	primary: "#7BA898",
	primarySoft: "#243530",
	secondary: "#D99F89",
	secondarySoft: "#3A2820",
	text: "#EBE9E4",
	textMuted: "#8E9590",
	border: "#2E3430",
	success: "#7AAB86",
	danger: "#D67C7C",
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

export const formatCurrency = (value: number, currencyCode?: string | null) => {
	const code = (currencyCode || "USD").toUpperCase();
	const info = CURRENCY_INFO[code];
	const locale = info?.locale ?? "en-US";
	const symbol = info?.symbol ?? "$";
	if (!Number.isFinite(value)) value = 0;
	try {
		const formatted = new Intl.NumberFormat(locale, {
			style: "currency",
			currency: code,
			maximumFractionDigits: info?.decimals ?? 2,
			minimumFractionDigits: info?.decimals ?? 2,
		}).format(value);
		return formatted;
	} catch {
		return `${symbol} ${value.toLocaleString(locale, { maximumFractionDigits: info?.decimals ?? 2, minimumFractionDigits: info?.decimals ?? 2 })}`;
	}
};

export const CURRENCY_INFO: Record<
	string,
	{ symbol: string; locale: string; decimals: number }
> = {
	USD: { symbol: "$", locale: "en-US", decimals: 2 },
	EUR: { symbol: "€", locale: "de-DE", decimals: 2 },
	GBP: { symbol: "£", locale: "en-GB", decimals: 2 },
	JPY: { symbol: "¥", locale: "ja-JP", decimals: 0 },
	CNY: { symbol: "¥", locale: "zh-CN", decimals: 2 },
	INR: { symbol: "₹", locale: "en-IN", decimals: 2 },
	LKR: { symbol: "Rs.", locale: "en-LK", decimals: 0 },
	AUD: { symbol: "A$", locale: "en-AU", decimals: 2 },
	CAD: { symbol: "C$", locale: "en-CA", decimals: 2 },
	SGD: { symbol: "S$", locale: "en-SG", decimals: 2 },
	MYR: { symbol: "RM", locale: "ms-MY", decimals: 2 },
	THB: { symbol: "฿", locale: "th-TH", decimals: 2 },
	IDR: { symbol: "Rp", locale: "id-ID", decimals: 0 },
	PHP: { symbol: "₱", locale: "en-PH", decimals: 2 },
	VND: { symbol: "₫", locale: "vi-VN", decimals: 0 },
	KRW: { symbol: "₩", locale: "ko-KR", decimals: 0 },
	AED: { symbol: "د.إ", locale: "ar-AE", decimals: 2 },
	SAR: { symbol: "﷼", locale: "ar-SA", decimals: 2 },
	QAR: { symbol: "﷼", locale: "ar-QA", decimals: 2 },
	KWD: { symbol: "د.ك", locale: "ar-KW", decimals: 3 },
	BHD: { symbol: "د.ب", locale: "ar-BH", decimals: 3 },
	OMR: { symbol: "﷼", locale: "ar-OM", decimals: 3 },
	CHF: { symbol: "Fr", locale: "de-CH", decimals: 2 },
	SEK: { symbol: "kr", locale: "sv-SE", decimals: 2 },
	NOK: { symbol: "kr", locale: "nb-NO", decimals: 2 },
	DKK: { symbol: "kr", locale: "da-DK", decimals: 2 },
	PLN: { symbol: "zł", locale: "pl-PL", decimals: 2 },
	TRY: { symbol: "₺", locale: "tr-TR", decimals: 2 },
	RUB: { symbol: "₽", locale: "ru-RU", decimals: 2 },
	BRL: { symbol: "R$", locale: "pt-BR", decimals: 2 },
	MXN: { symbol: "Mex$", locale: "es-MX", decimals: 2 },
	ZAR: { symbol: "R", locale: "en-ZA", decimals: 2 },
	NZD: { symbol: "NZ$", locale: "en-NZ", decimals: 2 },
	HKD: { symbol: "HK$", locale: "en-HK", decimals: 2 },
	TWD: { symbol: "NT$", locale: "zh-TW", decimals: 2 },
	PKR: { symbol: "₨", locale: "en-PK", decimals: 0 },
	BDT: { symbol: "৳", locale: "bn-BD", decimals: 2 },
	NPR: { symbol: "₨", locale: "ne-NP", decimals: 2 },
	EGP: { symbol: "£", locale: "ar-EG", decimals: 2 },
	NGN: { symbol: "₦", locale: "en-NG", decimals: 2 },
	KES: { symbol: "KSh", locale: "en-KE", decimals: 2 },
	ILS: { symbol: "₪", locale: "he-IL", decimals: 2 },
	COP: { symbol: "Col$", locale: "es-CO", decimals: 2 },
	CLP: { symbol: "CLP$", locale: "es-CL", decimals: 0 },
	ARS: { symbol: "AR$", locale: "es-AR", decimals: 2 },
	PEN: { symbol: "S/", locale: "es-PE", decimals: 2 },
};

export const currencyOptions = Object.keys(CURRENCY_INFO).map((code) => ({
	code,
	symbol: CURRENCY_INFO[code]!.symbol,
}));

export const formatShortDate = (value?: string | null) => {
	if (!value) {
		return "—";
	}

	return new Date(value).toLocaleDateString("en-LK", {
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
	const planStart = new Date(planStartDate);
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

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const dateToISO = (date: Date | string) =>
	typeof date === "string"
		? date.slice(0, 10)
		: date.toISOString().slice(0, 10);

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
