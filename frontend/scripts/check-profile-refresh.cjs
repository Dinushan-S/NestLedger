const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('components/nestledger/hooks/useProfileDataController.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const rows = [{ id: 'existing-expense' }];
const empty = async () => [];
const moduleObject = { exports: {} };
vm.runInNewContext(compiled, {
  exports: moduleObject.exports,
  require(name) {
    if (name === 'react') return { useCallback: (fn) => fn, useRef: (current) => ({ current }) };
    if (name === '@/lib/offline') return { getCached: async () => undefined };
    if (name === '@/lib/nestledger') return {
      billApi: { fetchTrackers: empty, fetchRecurringBills: empty, fetchPayments: empty },
      budgetApi: { fetchPlans: empty },
      expenseApi: { fetchProfileExpenses: async () => rows },
      notificationApi: { fetchForUser: empty },
      profileApi: { fetchMembers: empty },
      expenseShortcutApi: { fetch: async () => { throw Object.assign(new Error('table missing'), { code: 'PGRST205' }); } },
      savingsApi: { fetchTrackers: empty, fetchSavings: empty },
      shoppingApi: { fetchItems: empty },
    };
    throw new Error(`Unexpected import: ${name}`);
  },
  Set,
  Date,
});
let loadedExpenses;
let reportedError;
const noOp = () => {};
const setters = Object.fromEntries([
  'setBillPayments', 'setBillTrackers', 'setMembers', 'setNotifications', 'setPlans',
  'setExpenseShortcuts', 'setRecurringBills', 'setSavings', 'setSavingsTrackers',
  'setSelectedPlanId', 'setShoppingItems',
].map((name) => [name, noOp]));
const { refreshProfileData } = moduleObject.exports.useProfileDataController({
  ...setters,
  onError: (message) => { reportedError = message; },
  selectedPlanId: null,
  sessionUserId: 'user',
  setProfileExpenses: (value) => { loadedExpenses = value; },
});
refreshProfileData('profile', true)
  .then(() => {
    assert.equal(loadedExpenses?.[0]?.id, rows[0].id);
    assert.equal(reportedError, null);
    console.log('Existing expenses load when shortcut table is missing');
  })
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
