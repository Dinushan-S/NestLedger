import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PasswordInput } from '@/components/nestledger/forms/ProfileFormControls';
import BentoCard from '@/components/ui/BentoCard';
import ModernButton from '@/components/ui/ModernButton';
import { useTheme } from '@/lib/theme-context';
import { supabase } from '@/lib/supabase';
import { authApi } from '@/lib/nestledger';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const { theme } = useTheme();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOtpRecovery = Boolean(email.trim());
  const isCodeValid = /^\d{6}$/.test(code);

  useEffect(() => {
    if (isOtpRecovery) return;
    let active = true;
    const acceptRecoveryLink = async (url: string | null) => {
      if (!url) return;
      try {
        const query = url.split('?')[1]?.split('#')[0] ?? '';
        const fragment = url.split('#')[1] ?? '';
        const params = new URLSearchParams(`${query}&${fragment}`);
        const tokenHash = params.get('token_hash');
        if (tokenHash) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (verifyError) throw verifyError;
        } else {
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (!access_token || !refresh_token || params.get('type') !== 'recovery') {
            throw new Error('Open the password reset link from your email again.');
          }
          const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
          if (sessionError) throw sessionError;
        }
        if (active) setReady(true);
      } catch (recoveryError) {
        if (active) setError(recoveryError instanceof Error ? recoveryError.message : 'This reset link is invalid or expired. Request a new one.');
      }
    };

    void Linking.getInitialURL().then(acceptRecoveryLink);
    const subscription = Linking.addEventListener('url', ({ url }) => void acceptRecoveryLink(url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [isOtpRecovery]);

  const verifyCode = async () => {
    if (!isCodeValid) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.verifyRecoveryCode(email.trim(), code);
      setReady(true);
    } catch (verifyError) {
      const message = verifyError instanceof Error ? verifyError.message.toLowerCase() : '';
      setError(/expired|invalid|token|otp/.test(message)
        ? 'That code is incorrect or expired. Return to sign in and request a new code.'
        : 'We could not verify the code. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match. Check both fields and try again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.updatePassword(password);
      await supabase.auth.signOut();
      router.replace('/');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Your password could not be changed. Request a new reset code and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <BentoCard tone="highlight" style={styles.card}>
          <Text style={[styles.title, { color: theme.text }]}>Reset your password</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>
            {ready
              ? 'Choose a new password for your NestLedger account.'
              : isOtpRecovery
                ? `If an account uses ${email}, a 6-digit code is on its way. Enter it below.`
                : 'Open the password reset link from your email to continue.'}
          </Text>
          {!ready && isOtpRecovery ? (
            <>
              <TextInput
                accessibilityLabel="6-digit reset code"
                autoComplete="one-time-code"
                autoCapitalize="none"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                placeholderTextColor={theme.textMuted}
                style={[styles.input, styles.codeInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                value={code}
              />
              <ModernButton disabled={!isCodeValid} loading={busy} onPress={() => void verifyCode()} text="Verify code" />
            </>
          ) : null}
          {ready ? (
            <>
              <PasswordInput label="New password" autoComplete="new-password" autoCapitalize="none" onChangeText={setPassword} placeholder="New password" value={password} />
              <PasswordInput label="Confirm new password" autoComplete="new-password" autoCapitalize="none" onChangeText={setConfirmation} placeholder="Confirm new password" value={confirmation} />
              <ModernButton loading={busy} onPress={() => void savePassword()} text="Save new password" />
            </>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.dangerText }]}>{error}</Text> : null}
          {!ready ? <ModernButton onPress={() => router.canGoBack() ? router.back() : router.replace('/')} secondary text="Back to sign in" /> : null}
        </BentoCard>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { gap: 12, padding: 24 },
  title: { fontSize: 26, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 22 },
  input: { borderRadius: 12, borderWidth: 1, fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  codeInput: { fontSize: 22, fontWeight: '700', letterSpacing: 4, textAlign: 'center' },
  error: { fontSize: 14, fontWeight: '600' },
});
