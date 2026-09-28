import { CURRENCY_INFO, symbolFor } from '@/constants/nestledger';

export type CurrencyOptionViewModel = {
  code: string;
  name: string;
  searchText: string;
  symbol: string;
};

export type CurrencySection = {
  data: CurrencyOptionViewModel[];
  title: string;
};

// Intl.DisplayNames would localise these, but Hermes does not implement it
// (React Native runs on Hermes by default), so the curated English name is the
// floor and DisplayNames is only an upgrade where the engine has it.
const currencyNames =
  typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(undefined, { type: 'currency' })
    : null;

function currencyNameFor(code: string): string {
  try {
    const localized = currencyNames?.of(code);
    if (localized && localized !== code) return localized;
  } catch {
    // Fall through to the curated name.
  }
  return CURRENCY_INFO[code]?.name ?? code;
}

export function buildCurrencyViewModels(
  codes: readonly string[] = Object.keys(CURRENCY_INFO),
): CurrencyOptionViewModel[] {
  return codes
    .map((rawCode) => {
      const code = rawCode.toUpperCase();
      const symbol = symbolFor(code);
      const name = currencyNameFor(code);

      return {
        code,
        name,
        searchText: `${code} ${name} ${symbol}`.toLowerCase(),
        symbol,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
export function buildCurrencySections({
  currentCode,
  popularCodes,
  query,
  viewModels,
}: {
  currentCode: string;
  popularCodes: string[];
  query: string;
  viewModels: CurrencyOptionViewModel[];
}): CurrencySection[] {
  const normalizedQuery = query.trim().toLowerCase();
  const byCode = new Map(viewModels.map((item) => [item.code, item]));

  if (normalizedQuery) {
    const matches = viewModels.filter((item) => item.searchText.includes(normalizedQuery));
    return matches.length ? [{ title: 'Search results', data: matches }] : [];
  }

  const current = byCode.get(currentCode.toUpperCase());
  const popular = popularCodes
    .map((code) => byCode.get(code.toUpperCase()))
    .filter(
      (item): item is CurrencyOptionViewModel =>
        item !== undefined && item.code !== current?.code,
    );
  const excludedCodes = new Set([
    ...(current ? [current.code] : []),
    ...popular.map((item) => item.code),
  ]);
  const remainder = viewModels.filter((item) => !excludedCodes.has(item.code));

  return [
    ...(current ? [{ title: 'Current selection', data: [current] }] : []),
    ...(popular.length ? [{ title: 'Popular', data: popular }] : []),
    ...(remainder.length ? [{ title: 'All currencies', data: remainder }] : []),
  ];
}
