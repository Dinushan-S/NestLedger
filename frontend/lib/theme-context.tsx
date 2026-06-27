import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { theme as lightTheme, darkTheme } from '@/constants/nestledger';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AppTheme = typeof lightTheme;

const STORAGE_KEY = 'nestledger-theme-mode';

type ThemeContextValue = {
  /** The resolved theme colours to use in components. */
  theme: AppTheme;
  /** Whether dark colours are currently active. */
  isDark: boolean;
  /** The user's explicit preference (system / light / dark). */
  themeMode: ThemeMode;
  /** Persist a new preference and update the active theme immediately. */
  setThemeMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  isDark: false,
  themeMode: 'system',
  setThemeMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  // Load saved preference on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setThemeModeState(saved);
        }
      })
      .catch(() => {});
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  }, []);

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && systemScheme === 'dark');

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDark, themeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Returns the active theme colours and mode controls. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
