import { CURRENCY_INFO } from '@/constants/nestledger';

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

const currencyNameByCode: Record<string, string> = {
  AED: 'United Arab Emirates Dirham',
  ARS: 'Argentine Peso',
  AUD: 'Australian Dollar',
  BDT: 'Bangladeshi Taka',
  BHD: 'Bahraini Dinar',
  BRL: 'Brazilian Real',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  CLP: 'Chilean Peso',
  CNY: 'Chinese Yuan',
  COP: 'Colombian Peso',
  DKK: 'Danish Krone',
  EGP: 'Egyptian Pound',
  EUR: 'Euro',
  GBP: 'British Pound',
  HKD: 'Hong Kong Dollar',
  IDR: 'Indonesian Rupiah',
  ILS: 'Israeli New Shekel',
  INR: 'Indian Rupee',
  JPY: 'Japanese Yen',
  KES: 'Kenyan Shilling',
  KRW: 'South Korean Won',
  KWD: 'Kuwaiti Dinar',
  LKR: 'Sri Lanka Rupee',
  MXN: 'Mexican Peso',
  MYR: 'Malaysian Ringgit',
  NGN: 'Nigerian Naira',
  NOK: 'Norwegian Krone',
  NPR: 'Nepalese Rupee',
  NZD: 'New Zealand Dollar',
  OMR: 'Omani Rial',
  PEN: 'Peruvian Sol',
  PHP: 'Philippine Peso',
  PKR: 'Pakistani Rupee',
  PLN: 'Polish Zloty',
  QAR: 'Qatari Riyal',
  RUB: 'Russian Ruble',
  SAR: 'Saudi Riyal',
  SEK: 'Swedish Krona',
  SGD: 'Singapore Dollar',
  THB: 'Thai Baht',
  TRY: 'Turkish Lira',
  TWD: 'New Taiwan Dollar',
  USD: 'United States Dollar',
  VND: 'Vietnamese Dong',
  ZAR: 'South African Rand',
};

export function buildCurrencyViewModels(): CurrencyOptionViewModel[] {
  return Object.entries(CURRENCY_INFO)
    .map(([code, info]) => {
      const name = currencyNameByCode[code] ?? code;

      return {
        code,
        name,
        searchText: `${code} ${name} ${info.symbol}`.toLowerCase(),
        symbol: info.symbol,
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
