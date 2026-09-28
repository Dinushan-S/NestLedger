// ExchangeRate-API's open endpoint: free, no key, CORS-enabled (the app also
// ships a web build), refreshed daily. We use it only to learn which currency
// codes exist. Names come from the curated table and symbols from Intl, both of
// which are offline, so a network failure just leaves the curated list.
//
// Nothing waits on this: the picker renders the curated codes immediately, so a
// cache would only shave latency off a non-blocking widening.
//
// Rates are also available at this host, but nothing in the app converts between
// currencies, so there is no reason to fetch them.
const ENDPOINT = "https://open.er-api.com/v6/latest/USD";

const isCodeList = (value: unknown): value is string[] =>
	Array.isArray(value) &&
	value.length > 0 &&
	value.every((code) => typeof code === "string" && /^[A-Z]{3}$/.test(code));

export async function fetchLiveCurrencyCodes(): Promise<string[]> {
	try {
		const response = await fetch(ENDPOINT);
		if (!response.ok) return [];
		const payload = (await response.json()) as { result?: string; rates?: unknown };
		if (payload.result !== "success" || !isCodeList(Object.keys(payload.rates ?? {}))) {
			return [];
		}
		return Object.keys(payload.rates as Record<string, number>).sort();
	} catch {
		// Offline, blocked, or the provider is down. The curated list still works.
		return [];
	}
}
