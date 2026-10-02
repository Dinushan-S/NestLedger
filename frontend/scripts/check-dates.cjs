const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

// Transpile a project .ts file and run it with react-native stubbed out, the same
// way check-theme.cjs does, so we can assert on real exports without a bundler.
function loadModule(relative, { shimRequire, intl } = {}) {
  const file = path.resolve(root, relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: shimRequire ?? require,
    ...(intl ? { Intl: intl } : {}),
  });
  return mod.exports;
}

const constants = loadModule('constants/nestledger.ts');
const {
  CURRENCY_INFO,
  REGION_CURRENCY,
  defaultCurrencyForDevice,
  formatCurrency,
  formatShortDate,
  parseDateOnly,
  toLocalDate,
  todayLocalDate,
} = constants;

const pad2 = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// The app targets Sri Lanka but must not roll the date at the UTC boundary in
// either direction, so exercise both sides of UTC and a DST-observing zone.
const zones = [
  'Asia/Colombo',
  'Asia/Kolkata',
  'Pacific/Kiritimati',
  'America/New_York',
  'America/Los_Angeles',
  'Pacific/Honolulu',
];

// Day/month/edge cases a user can actually pick.
const days = [
  '2026-09-29', '2026-01-01', '2026-12-31', '2027-01-01',
  '2024-02-29', '2026-03-01', '2026-10-01', '2026-11-01',
];

for (const zone of zones) {
  process.env.TZ = zone;

  // Writing "today" must stay on the local calendar day.
  for (const probe of [
    new Date(2026, 8, 29, 0, 30),
    new Date(2026, 8, 29, 12, 0),
    new Date(2026, 8, 29, 23, 30),
    new Date(2027, 0, 1, 0, 15),
  ]) {
    assert.equal(toLocalDate(probe), local(probe), `${zone}: toLocalDate must keep the local day`);
  }
  assert.equal(todayLocalDate(), local(new Date()), `${zone}: todayLocalDate must be the local day`);

  // 2. Reading a stored day back must return that same day, not the day before.
  for (const day of days) {
    const parsed = parseDateOnly(day);
    assert.equal(local(parsed), day, `${zone}: parseDateOnly(${day}) drifted to ${local(parsed)}`);
    assert.equal(
      parsed.getFullYear(), Number(day.slice(0, 4)),
      `${zone}: parseDateOnly(${day}) wrong year`,
    );
  }

  // 3. A date-only string must never render as the previous/next day.
  for (const day of days) {
    const shown = new Intl.DateTimeFormat('en-CA', {
      timeZone: undefined,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(parseDateOnly(day));
    assert.equal(shown, day, `${zone}: formatShortDate path rendered ${day} as ${shown}`);
  }

  // Proves assertions 2 and 3 can fail: a revert to new Date(value) has to trip
  // them, otherwise this script would pass while the bug is live. A stored day
  // only drifts for zones WEST of UTC, so that is where the guard applies.
  const offsetMinutes = new Date(2026, 8, 29, 12).getTimezoneOffset();
  const drifted = days.filter((d) => local(new Date(d)) !== d);
  if (offsetMinutes > 0) {
    assert.ok(
      drifted.length > 0,
      `${zone}: UTC parsing should drift west of UTC but did not, so this zone cannot catch a regression`,
    );
  }
  // East of UTC the write bug lands in the small hours; west of UTC it lands in
  // the evening. Probing both edges means any non-zero offset has a failing case.
  const writeProbes = [new Date(2026, 8, 29, 0, 30), new Date(2026, 8, 29, 23, 30)];
  const writeDrifted = writeProbes.filter((p) => p.toISOString().slice(0, 10) !== local(p));
  assert.ok(
    writeDrifted.length > 0,
    `${zone}: neither write edge distinguishes local from UTC, so this zone cannot catch a regression`,
  );

// A Postgres `date` column must be written as YYYY-MM-DD. Normalising a picked
// or scanned date through toISOString() instead stores the UTC day, which is the
// previous day for every zone at or east of UTC, so the row is permanently off by
// one. This asserts the round trip the expense and borrow paths actually do.
for (const day of days) {
  assert.equal(
    toLocalDate(parseDateOnly(day)),
    day,
    `${zone}: normalising ${day} for a date column must not shift it`,
  );
}
const dateColumnDrift = days.filter(
  (d) => parseDateOnly(d).toISOString().slice(0, 10) !== d,
);
if (offsetMinutes <= 0) {
  assert.ok(
    dateColumnDrift.length > 0,
    `${zone}: a UTC round trip should shift a date column east of UTC but did not, ` +
      'so this zone cannot catch the bug',
  );
}
assert.equal(
  toLocalDate(parseDateOnly('28 Sept 2026')),
  '2026-09-28',
  'a printed-format date from a scanned receipt must normalise to the picked day',
);

console.log(
  `  ${zone}: UTC offset ${-offsetMinutes / 60}h | ${days.length} days parsed, ` +
    `${drifted.length} drift on read | ${writeDrifted.length}/2 write edges drift | ` +
    `${dateColumnDrift.length}/${days.length} shift a date column`,
);
}

// Timestamps are instants, not calendar days: parseDateOnly must not touch them.
process.env.TZ = 'America/Los_Angeles';
const stamp = '2026-09-29T18:00:00.000Z';
assert.equal(
  parseDateOnly(stamp).getTime(),
  new Date(stamp).getTime(),
  'parseDateOnly must pass timestamps through as instants',
);
assert.equal(toLocalDate('2026-09-29'), '2026-09-29', 'bare date passthrough unchanged');
assert.equal(toLocalDate(stamp), '2026-09-29', 'timestamp passthrough slices the UTC day');

// Currency follows the space, and the device-region default must be a usable code.
process.env.TZ = 'Asia/Colombo';
assert.equal(CURRENCY_INFO.LKR.decimals, 0, 'LKR must stay zero-decimal');
const lkrAmount = (value) => formatCurrency(value, 'LKR').replace(CURRENCY_INFO.LKR.symbol, '').trim();
assert.ok(
  !lkrAmount(1234.5).includes('.'),
  `LKR must render without decimals, got ${formatCurrency(1234.5, 'LKR')}`,
);
assert.ok(
  !('locale' in CURRENCY_INFO.USD),
  'CURRENCY_INFO must not pin a locale; that would override the device locale',
);

// An amount must never lead with a bare ticker. Where Intl has a real symbol
// ("$", "€", "CA$", "CLP$", "¥") it wins; where it echoes the code back
// (Hermes, trimmed ICU) our curated symbol is substituted. A symbol may legally
// start with the letters, e.g. "CLP$", so only a code followed by a space counts.
//
// Scope: this only guarantees the curated CURRENCY_INFO codes. The live currency
// API adds ~120 codes with no curated entry, so those can still render as a bare
// ticker. That is a known, accepted ceiling - see useCurrencyCodes.ts.
for (const [code] of Object.entries(CURRENCY_INFO)) {
  const rendered = formatCurrency(1234.5, code);
  assert.ok(
    !new RegExp(`^${code}[\\s\\u00a0]`).test(rendered),
    `${code} rendered as "${rendered}", leading with the bare code instead of a symbol`,
  );
}
// Intl's own symbol must survive when it is a real one, not our fallback.
assert.ok(
  formatCurrency(1234.5, 'USD').includes('$'),
  `USD must keep its Intl symbol, got ${formatCurrency(1234.5, 'USD')}`,
);
assert.ok(
  !formatCurrency(1234.5, 'LKR').startsWith('LKR'),
  `LKR must not lead with the raw code, got ${formatCurrency(1234.5, 'LKR')}`,
);
assert.ok(
  formatCurrency(1234.5, 'LKR').includes('Rs.'),
  `LKR must fall back to the curated symbol, got ${formatCurrency(1234.5, 'LKR')}`,
);
const deviceCurrency = defaultCurrencyForDevice();
assert.match(deviceCurrency, /^[A-Z]{3}$/, `device default must be an ISO code, got ${deviceCurrency}`);
assert.ok(CURRENCY_INFO[deviceCurrency], `device default ${deviceCurrency} is not a selectable currency`);
assert.ok(
  formatCurrency(1, deviceCurrency).length > 0,
  'device default currency must format without throwing',
);
assert.equal(formatCurrency(Number.NaN, 'USD').length > 0, true, 'NaN must not throw');
assert.equal(formatCurrency(10, 'NOPE')[0].length > 0, true, 'unknown code must not throw');

// Hermes has no Intl.DisplayNames, so every curated code must still carry a
// readable name. Simulate that engine by loading the selector with it removed.
const { buildCurrencyViewModels } = loadModule(
  'components/nestledger/settings/currencySelector.ts',
  {
    shimRequire: (id) => (id.includes('constants/nestledger') ? constants : require(id)),
    intl: { ...Intl, DisplayNames: undefined },
  },
);
const noDisplayNames = buildCurrencyViewModels();
for (const item of noDisplayNames) {
  assert.ok(
    item.name && item.name !== item.code,
    `${item.code} has no name on Hermes (Intl.DisplayNames absent); got "${item.name}"`,
  );
  assert.ok(
    item.searchText.includes(item.name.toLowerCase()),
    `${item.code} is not searchable by name, got searchText "${item.searchText}"`,
  );
}
assert.equal(
  noDisplayNames.length,
  Object.keys(CURRENCY_INFO).length,
  'without a live list the picker must fall back to exactly the curated codes',
);

// Region -> currency defaults. There is no ISO region list in Intl
// (supportedValuesOf has no 'region' key, and DateTimeFormat only reports which
// locale data exists), so this checks shape and cross-references instead. That
// catches the mistake that actually happens: a currency code pasted where the
// region belongs, as in SGD: "SGD", which silently sent Singapore to USD.
const regionEntries = Object.entries(REGION_CURRENCY);
for (const [region, currency] of regionEntries) {
  assert.match(
    region,
    /^[A-Z]{2}$/,
    `region key "${region}" must be a 2-letter ISO 3166-1 code, not a currency code`,
  );
  assert.ok(
    !CURRENCY_INFO[region],
    `region key "${region}" is a currency code; it should be a country/region`,
  );
  assert.ok(
    CURRENCY_INFO[currency],
    `${region} maps to "${currency}", which is not a selectable currency`,
  );
}
assert.equal(
  new Set(regionEntries.map(([region]) => region)).size,
  regionEntries.length,
  'REGION_CURRENCY has duplicate region keys',
);
assert.equal(REGION_CURRENCY.SG, 'SGD', 'Singapore must map to SGD');
// Shape checks above cannot catch a well-formed but wrong mapping (e.g. AU: "NZD"),
// so pin the three that were missing until every curated currency has a region.
assert.equal(REGION_CURRENCY.BH, 'BHD', 'Bahrain must map to BHD');
assert.equal(REGION_CURRENCY.OM, 'OMR', 'Oman must map to OMR');
assert.equal(REGION_CURRENCY.QA, 'QAR', 'Qatar must map to QAR');
assert.equal(
  Object.keys(CURRENCY_INFO).filter(
    (c) => !regionEntries.some(([, currency]) => currency === c),
  ).length,
  0,
  'every curated currency should have at least one region default',
);
assert.equal(defaultCurrencyForDevice().length, 3, 'device default must stay an ISO code');

console.log(
  `Local-date and currency checks passed across ${zones.length} timezones ` +
    `(${regionEntries.length} region defaults, device default ${deviceCurrency}).`,
);
