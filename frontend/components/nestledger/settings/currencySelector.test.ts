import { buildCurrencySections, buildCurrencyViewModels } from './currencySelector';

describe('currency selector helpers', () => {
  it('builds searchable currency view models with names, symbols, and search terms', () => {
    const models = buildCurrencyViewModels();
    const usd = models.find((item) => item.code === 'USD');
    const lkr = models.find((item) => item.code === 'LKR');

    expect(models.length).toBeGreaterThan(10);
    expect(usd).toMatchObject({
      code: 'USD',
      name: 'United States Dollar',
      symbol: '$',
    });
    expect(usd?.searchText).toContain('united states dollar');
    expect(lkr?.searchText).toContain('sri lanka rupee');
  });

  it('groups current, popular, and all currencies for the default settings view', () => {
    const sections = buildCurrencySections({
      currentCode: 'LKR',
      popularCodes: ['USD', 'EUR', 'GBP', 'LKR'],
      query: '',
      viewModels: buildCurrencyViewModels(),
    });

    expect(sections.map((section) => section.title)).toEqual([
      'Current selection',
      'Popular',
      'All currencies',
    ]);
    expect(sections[0].data.map((item) => item.code)).toEqual(['LKR']);
    expect(sections[1].data.map((item) => item.code)).toEqual(['USD', 'EUR', 'GBP']);
    expect(sections[2].data.some((item) => item.code === 'JPY')).toBe(true);
  });

  it('returns only matching results when the user searches', () => {
    const sections = buildCurrencySections({
      currentCode: 'LKR',
      popularCodes: ['USD', 'EUR', 'GBP'],
      query: 'yen',
      viewModels: buildCurrencyViewModels(),
    });

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Search results');
    expect(sections[0].data.map((item) => item.code)).toEqual(['JPY']);
  });
});
