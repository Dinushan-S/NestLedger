import Constants from 'expo-constants';

type ExtraConfig = {
  backendUrl?: string;
  publicAppUrl?: string;
  supabaseAnonKey?: string;
  supabaseUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

export const appConfig = {
  backendUrl: extra.backendUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? '',
  publicAppUrl: extra.publicAppUrl ?? process.env.EXPO_PUBLIC_APP_URL ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? '',
  supabaseAnonKey: extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseUrl: extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  scheme: Constants.expoConfig?.scheme ?? 'nestledger',
};

export const isConfigReady =
  Boolean(appConfig.backendUrl) &&
  Boolean(appConfig.supabaseAnonKey) &&
  Boolean(appConfig.supabaseUrl);