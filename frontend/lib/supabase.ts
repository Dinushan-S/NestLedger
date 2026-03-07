import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { appConfig } from './config';

const webStorage = {
  getItem: (key: string) => Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
  removeItem: (key: string) => Promise.resolve(globalThis.localStorage?.removeItem(key)),
  setItem: (key: string, value: string) => Promise.resolve(globalThis.localStorage?.setItem(key, value)),
};

const storage = Platform.OS === 'web' ? webStorage : AsyncStorage;

export const supabase = createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: Platform.OS === 'web',
    persistSession: true,
    storage,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});