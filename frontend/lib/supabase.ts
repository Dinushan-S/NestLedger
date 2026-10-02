import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { appConfig } from './config';
import { network, networkFetch } from './network';

const webStorage = {
  getItem: (key: string) => Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
  removeItem: (key: string) => Promise.resolve(globalThis.localStorage?.removeItem(key)),
  setItem: (key: string, value: string) => Promise.resolve(globalThis.localStorage?.setItem(key, value)),
};

const storage = Platform.OS === 'web' ? webStorage : AsyncStorage;
const storageKey = `sb-${appConfig.supabaseUrl ? new URL(appConfig.supabaseUrl).hostname.split('.')[0] : 'unconfigured'}-auth-token`;

// Reading the persisted session directly never waits for an expired-token refresh.
// It identifies the local cache only; Supabase still authenticates every remote request.
export async function readStoredSession(): Promise<Session | null> {
  const value = await storage.getItem(storageKey);
  if (!value) return null;
  try {
    const session = JSON.parse(value) as Session;
    return session.user?.id && session.access_token && session.refresh_token ? session : null;
  } catch { return null; }
}

// Auth callback/recovery routes also need the initial check, even without the main app mounted.
if (appConfig.supabaseUrl) void network.check();
export const supabase = createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: Platform.OS === 'web',
    persistSession: true,
    storage,
    storageKey,
  },
  global: { fetch: networkFetch },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
