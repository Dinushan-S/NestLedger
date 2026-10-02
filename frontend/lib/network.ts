import { appConfig } from './config';

let online = false;
let checking: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function setOnline(value: boolean) {
  if (online === value) return;
  online = value;
  listeners.forEach((listener) => listener());
}

async function timedFetch(input: RequestInfo | URL, init?: RequestInit, timeout = 8000) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  init?.signal?.addEventListener('abort', abort);
  if (init?.signal?.aborted) abort();
  const timer = setTimeout(abort, timeout);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener('abort', abort);
  }
}

export const network = {
  isOnline: () => online,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  check() {
    if (checking) return checking;
    checking = (async () => {
      try {
        const response = await timedFetch(`${appConfig.supabaseUrl}/auth/v1/health`, {
          headers: { apikey: appConfig.supabaseAnonKey }, cache: 'no-store',
        }, 3000);
        setOnline(response.ok);
      } catch { setOnline(false); }
      return online;
    })().finally(() => { checking = null; });
    return checking;
  },
};

// Wait for startup's reachability probe, then reject offline requests without querying the database.
export const networkFetch: typeof fetch = async (input, init) => {
  if (!online && checking) await checking;
  if (!online) throw new TypeError('Offline. Your saved expenses will sync when connected.');
  const affectsDatabase = (typeof input === 'object' && 'url' in input ? input.url : String(input)).startsWith(appConfig.supabaseUrl);
  try {
    const response = await timedFetch(input, init);
    if (affectsDatabase && response.status >= 500) setOnline(false);
    return response;
  } catch (error) {
    if (affectsDatabase && !init?.signal?.aborted) setOnline(false);
    throw error;
  }
};
