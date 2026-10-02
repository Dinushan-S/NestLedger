import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Expense, ExpenseItem, ExpenseWithItems } from './nestledger';
import { network } from './network';
import { readStoredSession, supabase } from './supabase';

type Operation = {
  revision: string;
  expense: ExpenseWithItems;
  kind: 'save' | 'delete';
  isNew: boolean;
  error?: string;
};
type LocalData = { cache: Record<string, unknown>; pending: Operation[] };
type Items = Omit<ExpenseItem, 'created_at' | 'expense_id' | 'id'>[];
export type ExpenseInput = Omit<Expense, 'created_at' | 'id' | 'price'> & { items: Items };
const listeners = new Set<() => void>();
let writes: Promise<unknown> = Promise.resolve();
const syncing = new Map<string, Promise<void>>();

function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function userId() {
  const session = await readStoredSession();
  if (!session) throw new Error('Please sign in to use saved data.');
  return session.user.id;
}
const key = (id: string) => `nestledger-offline-v1-${id}`;
async function read(id: string): Promise<LocalData> {
  const value = await AsyncStorage.getItem(key(id));
  return value ? JSON.parse(value) as LocalData : { cache: {}, pending: [] };
}

// ponytail: serialize the small per-account document; use SQLite if history outgrows AsyncStorage.
function change<T>(id: string, work: (data: LocalData) => T): Promise<T> {
  const result = writes.then(async () => {
    const data = await read(id);
    const value = work(data);
    await AsyncStorage.setItem(key(id), JSON.stringify(data));
    listeners.forEach((listener) => listener());
    return value;
  });
  writes = result.catch(() => undefined);
  return result;
}

export async function getCached<T>(name: string): Promise<T | undefined> {
  await writes;
  const data = await read(await userId());
  return data.cache[name] as T | undefined;
}

export function withCache<A extends string[], T>(name: string, load: (...args: A) => Promise<T>, fallback: T) {
  return async (...args: A): Promise<T> => {
    const id = await userId();
    const cacheKey = `${name}:${args.join(':')}`;
    await writes;
    if (!network.isOnline()) return (await read(id)).cache[cacheKey] as T ?? fallback;
    try {
      const value = await load(...args);
      if ((await userId()) !== id) throw new Error('Account changed while loading data.');
      await change(id, (data) => { data.cache[cacheKey] = value; });
      return value;
    } catch (error) {
      if (network.isOnline()) throw error;
      return (await read(id)).cache[cacheKey] as T ?? fallback;
    }
  };
}

const expenseKey = (profileId: string) => `expenses:${profileId}`;
const rows = (data: LocalData, profileId: string) => (data.cache[expenseKey(profileId)] ?? []) as ExpenseWithItems[];
function queue(data: LocalData, expense: ExpenseWithItems, kind: Operation['kind'], isNew = false) {
  const previous = data.pending.find((item) => item.expense.id === expense.id);
  data.pending = data.pending.filter((item) => item.expense.id !== expense.id);
  data.pending.push({ revision: uuid(), expense, kind, isNew: previous?.isNew ?? isNew });
  data.cache[expenseKey(expense.profile_id)] = [
    ...(kind === 'save' ? [expense] : []),
    ...rows(data, expense.profile_id).filter((item) => item.id !== expense.id),
  ];
}
function makeItems(expenseId: string, items: Items): ExpenseItem[] {
  return items.map((item) => ({ ...item, id: uuid(), expense_id: expenseId, created_at: new Date().toISOString() }));
}
function validate(input: ExpenseInput) {
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (!input.profile_id || !input.plan_id || !input.category.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== input.date || input.date.startsWith('0000-') || !input.items.length ||
      !Number.isFinite(input.items.reduce((sum, item) => sum + item.price, 0)) ||
      input.items.some((item) => !item.name.trim() || !Number.isFinite(item.price))) {
    throw new Error('Enter a valid date, category, and expense items.');
  }
}

export const offlineExpenses = {
  async addExpense(input: ExpenseInput, _columns = '*') {
    validate(input);
    const id = await userId();
    if (input.added_by !== id) throw new Error('Expense must belong to the signed-in account.');
    const expenseId = uuid();
    const expense: ExpenseWithItems = {
      ...input, id: expenseId, created_at: new Date().toISOString(),
      description: input.description?.trim() || null,
      price: input.items.reduce((total, item) => total + item.price, 0),
      items: makeItems(expenseId, input.items),
    };
    await change(id, (data) => queue(data, expense, 'save', true));
    return expense;
  },
  async updateExpense(expenseId: string,
    updates: Partial<Pick<Expense, 'category' | 'date' | 'description' | 'paid_by' | 'used_by'>>, items?: Items) {
    const id = await userId();
    await change(id, (data) => {
      const original = Object.values(data.cache).flatMap((value) => Array.isArray(value) ? value : [])
        .find((item: ExpenseWithItems) => item.id === expenseId && Array.isArray(item.items)) as ExpenseWithItems | undefined;
      if (!original) throw new Error('Load this expense before editing it.');
      const expense = { ...original, ...updates,
        ...(items ? { items: makeItems(expenseId, items), price: items.reduce((sum, item) => sum + item.price, 0) } : {}),
      };
      validate(expense);
      queue(data, expense, 'save');
    });
  },
  async deleteExpense(expenseId: string) {
    const id = await userId();
    await change(id, (data) => {
      const expense = Object.values(data.cache).flatMap((value) => Array.isArray(value) ? value : [])
        .find((item: ExpenseWithItems) => item.id === expenseId && Array.isArray(item.items)) as ExpenseWithItems | undefined;
      if (!expense) throw new Error('Load this expense before deleting it.');
      queue(data, expense, 'delete');
    });
  },
  async clearPlanExpenses(planId: string) {
    const id = await userId();
    await change(id, (data) => {
      const expenses = Object.entries(data.cache).filter(([name]) => name.startsWith('expenses:'))
        .flatMap(([, value]) => value as ExpenseWithItems[]).filter((expense) => expense.plan_id === planId);
      for (const expense of expenses) queue(data, expense, 'delete');
    });
  },
  async fetchProfileExpenses(profileId: string): Promise<ExpenseWithItems[]> {
    const id = await userId();
    await writes;
    if (network.isOnline()) {
      const pendingBefore = (await read(id)).pending.map((item) => item.revision).join(':');
      const { data: remote, error } = await supabase.from('expenses')
        .select('*, items:expense_items(*)').eq('profile_id', profileId).order('date', { ascending: false });
      if (error && network.isOnline()) throw error;
      if ((await userId()) !== id) throw new Error('Account changed while loading expenses.');
      if (!error) await change(id, (data) => {
        if (data.pending.map((item) => item.revision).join(':') !== pendingBefore) return;
        data.cache[expenseKey(profileId)] = remote ?? [];
        for (const operation of data.pending.filter((item) => item.expense.profile_id === profileId)) {
          data.cache[expenseKey(profileId)] = rows(data, profileId).filter((item) => item.id !== operation.expense.id);
          if (operation.kind === 'save') rows(data, profileId).push(operation.expense);
        }
      });
    }
    return rows(await read(id), profileId).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  },
};

export const offlineStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async status() {
    await writes;
    const data = await read(await userId());
    return { pending: data.pending.length, error: data.pending.find((item) => item.error)?.error ?? null,
      ids: data.pending.map((item) => item.expense.id) };
  },
};

export async function syncExpenses(retryErrors = false): Promise<void> {
  const id = await userId();
  const running = syncing.get(id);
  if (running) return running;
  const run = (async () => {
    await writes;
    const pending = (await read(id)).pending;
    for (const operation of pending) {
      if (!network.isOnline() || (await userId()) !== id) break;
      if (operation.error && !retryErrors) continue;
      // A queued edit/delete may have replaced this snapshot while another row synced.
      if (!(await read(id)).pending.some((item) => item.revision === operation.revision)) continue;
      try {
        const { expense } = operation;
        const result = await supabase.rpc('sync_expense', {
          p_expense: expense, p_actor_id: id,
          p_delete: operation.kind === 'delete', p_is_new: operation.isNew,
        });
        if (result.error) throw result.error;
        await change(id, (data) => {
          data.pending = data.pending.filter((item) => item.revision !== operation.revision);
        });
      } catch (error) {
        if (!network.isOnline()) break;
        await change(id, (data) => {
          const current = data.pending.find((item) => item.revision === operation.revision);
          if (current) current.error = (error as { message?: string }).message ?? 'Could not sync this expense.';
        });
      }
    }
  })();
  syncing.set(id, run);
  try { await run; } finally { syncing.delete(id); }
}
