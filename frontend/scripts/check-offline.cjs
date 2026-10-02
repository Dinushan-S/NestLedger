const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const storage = new Map();
let online = false;
let requests = 0;
let authRequests = 0;
let failStorage = false;
let session = { user: { id: 'user-a' }, access_token: 'test', expires_at: 1 };
const remote = new Map();
let rpcBehavior;
let readBehavior;
const effects = [];
let hookReact;
let nativeShim = {};
let networkShim;
let fetchShim;
let timerShim = { setTimeout, clearTimeout, setInterval, clearInterval };
const modules = new Map();
const supabase = {
  auth: {
    getSession: async () => { authRequests++; return { data: { session }, error: null }; },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    startAutoRefresh: async () => {}, stopAutoRefresh: async () => {},
  },
  async rpc(name, args) {
    requests++;
    assert.equal(name, 'sync_expense');
    assert.equal(args.p_actor_id, session.user.id);
    if (rpcBehavior) return rpcBehavior(args);
    if (args.p_delete) remote.delete(args.p_expense.id);
    else remote.set(args.p_expense.id, structuredClone(args.p_expense));
    return { error: null };
  },
  from(table) {
    requests++;
    const filters = {};
    const snapshot = [...remote.values()];
    const query = new Proxy({}, { get: (_, name) => name === 'then'
      ? (resolve) => resolve(readBehavior ? readBehavior(table, snapshot) : {
        data: table === 'expenses' ? snapshot.filter((row) => row.profile_id === filters.profile_id) : [], error: null,
      })
      : (...args) => { if (name === 'eq') filters[args[0]] = args[1]; return query; } });
    return query;
  },
};
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} };
  modules.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports: mod.exports, module: mod, Date, Map, Set, Promise, JSON, AbortController,
    ...timerShim, fetch: (...args) => fetchShim(...args),
    crypto: require('node:crypto').webcrypto,
    require(name) {
      if (name === '@react-native-async-storage/async-storage') return { default: {
        getItem: async (key) => storage.get(key) ?? null,
        setItem: async (key, value) => { if (failStorage) throw new Error('Disk full'); storage.set(key, value); },
      } };
      if (name.endsWith('/supabase') || name === './supabase') return { supabase, readStoredSession: async () => session };
      if (name === './config') return { appConfig: { supabaseUrl: 'https://database.test', supabaseAnonKey: 'test' } };
      if (name === './expenseWidget' || name === '@/lib/expenseWidget') return {
        expenseWidget: { token: async () => null, clear: async () => {}, revokeSession: async () => {} },
        expenseWidgetStorage: { clearOwner: async () => {} },
      };
      if (name === 'expo') return { isRunningInExpoGo: () => true, requireOptionalNativeModule: () => null };
      if (name === '@/lib/config') return { isConfigReady: true };
      if (name === 'react') return hookReact ?? {
        useCallback: (fn) => fn, useRef: (current) => ({ current }), useEffect: (fn) => effects.push(fn),
      };
      if (name === 'react-native') return nativeShim;
      if (name === './network' || name === '@/lib/network') return networkShim ?? { network: { isOnline: () => online }, networkFetch: async () => { throw new TypeError('Offline'); } };
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return mod.exports;
}
const input = {
  added_by: 'user-a', profile_id: 'space-a', plan_id: 'plan-a',
  category: 'Food', date: '2026-10-02', description: null,
  is_borrow: false, paid_by: null, used_by: null,
  items: [{ name: 'Lunch', price: 450 }],
};
async function check() {
  let { expenseApi, authApi } = load('lib/nestledger.ts');
  assert.equal((await authApi.getSession()).user.id, 'user-a');
  assert.equal(authRequests, 0, 'expired cached login must not wait for online refresh');
  const saved = await expenseApi.addExpense(input);
  assert.equal(saved.price, 450, 'offline expense must be saved');
  assert.equal(requests, 0, 'offline save must not contact the database');
  assert.equal((await expenseApi.fetchProfileExpenses('space-a'))[0].id, saved.id);
  modules.clear(); // Simulate closing and reopening the app; keep only disk storage.
  assert.equal((await load('lib/nestledger.ts').expenseApi.fetchProfileExpenses('space-a'))[0].id, saved.id);
  ({ expenseApi } = load('lib/nestledger.ts'));
  let { offlineStore, syncExpenses, withCache } = load('lib/offline.ts');
  await expenseApi.updateExpense(saved.id, { description: 'Edited offline' }, [{ name: 'Lunch', price: 500 }]);
  assert.equal((await expenseApi.fetchProfileExpenses('space-a'))[0].price, 500);
  assert.equal((await offlineStore.status()).pending, 1, 'coalesce edits of an unsynced expense');
  assert.equal((await expenseApi.fetchProfileExpenses('space-b')).length, 0);

  const cacheProfiles = withCache('profiles', async () => [{ id: 'space-a', currency: 'LKR' }], []);
  const cacheUser = withCache('user-profile', async () => ({ user_id: 'user-a', name: 'Test' }), null);
  online = true;
  await cacheProfiles('user-a');
  await cacheUser('user-a');
  online = false;
  const beforeStartup = requests;
  const state = {};
  const setter = (name) => (value) => { state[name] = typeof value === 'function' ? value(state[name] ?? null) : value; };
  load('components/nestledger/hooks/useNestLedgerBootstrap.ts').useNestLedgerBootstrap({
    activeProfileId: null, online: false, sessionUserId: 'user-a', onSchemaMissing: () => false, onSessionCleared() {},
    ...Object.fromEntries(['ActiveProfileId', 'Booting', 'Busy', 'ProfileLoaded', 'Profiles', 'Session', 'SetupMessage', 'UserProfile']
      .map((name) => [`set${name}`, setter(name)])),
  });
  const cleanups = effects.splice(0).map((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.Booting, false);
  assert.equal(state.Busy, false);
  assert.equal(state.ActiveProfileId, 'space-a');
  assert.equal(state.Profiles.length, 1);
  assert.equal(requests, beforeStartup, 'offline startup must not query database');
  cleanups.forEach((cleanup) => cleanup?.());

  const second = await expenseApi.addExpense({ ...input, items: [{ name: 'Tea', price: 100 }] });
  online = true;
  // Reading an empty server must keep both pending local rows and their totals.
  assert.equal((await expenseApi.fetchProfileExpenses('space-a')).length, 2);
  rpcBehavior = async (args) => {
    remote.set(args.p_expense.id, structuredClone(args.p_expense));
    online = false; // Server committed, but response was lost.
    throw new TypeError('Network request failed');
  };
  await syncExpenses();
  assert.equal((await offlineStore.status()).pending, 2);
  rpcBehavior = null;
  online = true;
  await syncExpenses();
  assert.equal(remote.size, 2, 'retry after lost acknowledgement must not duplicate expenses');
  assert.equal((await offlineStore.status()).pending, 0);
  assert.equal(remote.get(saved.id).price, 500);

  online = false;
  await expenseApi.updateExpense(saved.id, { category: 'Other' }, [{ name: 'Meal', price: 550 }]);
  await expenseApi.deleteExpense(second.id);
  online = true;
  await syncExpenses();
  assert.equal(remote.get(saved.id).price, 550);
  assert.equal(remote.has(second.id), false);
  await expenseApi.fetchProfileExpenses('space-a');

  // A newer edit made while an older save is in flight must keep its queue entry.
  online = false;
  await expenseApi.updateExpense(saved.id, { description: 'First' });
  online = true;
  let release;
  let started;
  const began = new Promise((resolve) => { started = resolve; });
  rpcBehavior = (args) => new Promise((resolve) => {
    started();
    release = () => { remote.set(args.p_expense.id, structuredClone(args.p_expense)); resolve({ error: null }); };
  });
  const syncing = syncExpenses();
  await began;
  await expenseApi.updateExpense(saved.id, { description: 'Latest' });
  release();
  await syncing;
  assert.equal((await offlineStore.status()).pending, 1);
  rpcBehavior = null;
  await syncExpenses();
  assert.equal(remote.get(saved.id).description, 'Latest');

  // A stale read started before sync cannot wipe the durable local entry.
  online = false;
  const third = await expenseApi.addExpense(input);
  online = true;
  let releaseRead;
  readBehavior = (_, snapshot) => new Promise((resolve) => {
    releaseRead = () => resolve({ data: snapshot, error: null });
  });
  const reading = expenseApi.fetchProfileExpenses('space-a');
  await new Promise((resolve) => setImmediate(resolve));
  await syncExpenses();
  releaseRead();
  assert.ok((await reading).some((row) => row.id === third.id));
  readBehavior = null;

  await expenseApi.updateExpense(saved.id, { description: 'Permission failure' });
  rpcBehavior = async () => ({ error: { message: 'Permission denied', code: '42501' } });
  await syncExpenses();
  assert.equal((await offlineStore.status()).pending, 1);
  assert.equal((await offlineStore.status()).error, 'Permission denied');
  const blockedRequests = requests;
  await syncExpenses();
  assert.equal(requests, blockedRequests, 'failed validation/permission must not retry forever');
  rpcBehavior = null;
  await syncExpenses(true);
  assert.equal((await offlineStore.status()).pending, 0);

  online = false;
  const isolated = await expenseApi.addExpense(input);
  session = { ...session, user: { id: 'user-b' } };
  assert.equal((await expenseApi.fetchProfileExpenses('space-a')).length, 0);
  assert.equal((await offlineStore.status()).pending, 0);
  online = true;
  await syncExpenses();
  assert.equal(remote.has(isolated.id), false, 'another account must never sync previous account drafts');
  session = { ...session, user: { id: 'user-a' } };
  online = false;
  assert.equal((await offlineStore.status()).pending, 1);
  failStorage = true;
  await assert.rejects(expenseApi.addExpense(input), /Disk full/);
  failStorage = false;
  assert.equal((await offlineStore.status()).pending, 1, 'failed disk write must not acknowledge the save');
  await assert.rejects(expenseApi.addExpense({ ...input, items: [{ name: 'Bad', price: NaN }] }), /valid/);
  await assert.rejects(expenseApi.addExpense({ ...input, date: '2026-02-30' }), /valid/);
  await Promise.all(Array.from({ length: 10 }, () => expenseApi.addExpense(input)));
  assert.equal((await offlineStore.status()).pending, 11, 'concurrent offline saves must not overwrite each other');
  await expenseApi.clearPlanExpenses('plan-a');
  assert.equal((await expenseApi.fetchProfileExpenses('space-a')).length, 0);
  online = true;
  await syncExpenses();
  assert.equal(remote.size, 0);
  assert.equal((await offlineStore.status()).pending, 0);

  // Exercise automatic reconnect/foreground sync through the real React hook.
  online = false;
  await expenseApi.addExpense(input);
  const slots = [];
  let cursor = 0;
  let dirty = true;
  let scheduled = [];
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  hookReact = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next) => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { fn, deps };
      return slots[index].fn;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) {
        scheduled.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; });
      }
    },
  };
  const connectionListeners = new Set();
  const appListeners = new Set();
  const intervals = new Set();
  networkShim = { network: {
    isOnline: () => online, check: async () => online,
    subscribe: (fn) => { connectionListeners.add(fn); return () => connectionListeners.delete(fn); },
  } };
  nativeShim = { AppState: {
    currentState: 'active',
    addEventListener: (_, fn) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; },
  } };
  timerShim = { ...timerShim,
    setInterval: (fn) => { intervals.add(fn); return fn; }, clearInterval: (fn) => intervals.delete(fn),
  };
  const { useOfflineSync } = load('components/nestledger/hooks/useOfflineSync.ts');
  let refreshes = 0;
  const refresh = async () => { refreshes++; };
  let hookState;
  async function settle() {
    for (let index = 0; index < 12; index++) {
      if (dirty) {
        dirty = false; cursor = 0;
        hookState = useOfflineSync('user-a', 'space-a', refresh);
        const callbacks = scheduled; scheduled = [];
        callbacks.forEach((callback) => callback());
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  const beforeReconnect = requests;
  await settle();
  assert.equal(hookState.pending, 1);
  assert.equal(requests, beforeReconnect, 'hook must not sync offline');
  online = true; connectionListeners.forEach((fn) => fn());
  await settle();
  assert.equal(hookState.pending, 0);
  assert.equal(remote.size, 1, 'connection return must automatically sync');
  assert.ok(refreshes > 0);
  nativeShim.AppState.currentState = 'background'; appListeners.forEach((fn) => fn('background'));
  const beforeBackground = requests;
  await expenseApi.addExpense(input);
  intervals.forEach((fn) => fn());
  await settle();
  assert.equal(requests, beforeBackground, 'background state must pause app sync');
  nativeShim.AppState.currentState = 'active'; appListeners.forEach((fn) => fn('active'));
  await settle();
  assert.equal(remote.size, 2, 'foreground return must sync queued changes');
  slots.forEach((slot) => slot.cleanup?.());

  // The actual request guard also has bounded probes and database requests.
  timerShim = { setTimeout: (fn) => setTimeout(fn, 5), clearTimeout, setInterval, clearInterval };
  let fetches = 0;
  fetchShim = async () => { fetches++; return { ok: true, status: 200 }; };
  const actualNetwork = load('lib/network.ts');
  await assert.rejects(actualNetwork.networkFetch('https://database.test/rest/v1/expenses'), /Offline/);
  assert.equal(fetches, 0);
  await Promise.all([actualNetwork.network.check(), actualNetwork.network.check()]);
  assert.equal(fetches, 1, 'deduplicate simultaneous reachability probes');
  fetchShim = (_, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('Request timeout')));
  });
  await assert.rejects(actualNetwork.networkFetch('https://database.test/rest/v1/expenses'), /timeout/);
  assert.equal(actualNetwork.network.isOnline(), false);
  assert.equal(await actualNetwork.network.check(), false, 'failed probe must finish and remain offline');
  console.log('Offline startup, save/reopen, edit/delete/reset, totals, automatic reconnect, foreground resume, safe retries, races, timeouts, storage failures and account isolation passed');
}
check().catch((error) => { console.error(error); process.exitCode = 1; });
