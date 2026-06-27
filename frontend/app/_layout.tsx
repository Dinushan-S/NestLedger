import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from '@/lib/theme-context';

function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppStatusBar />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="confirm-email" />
          <Stack.Screen name="index" />
          <Stack.Screen name="invite" />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
