import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/nestledger';
import ModernButton from '@/components/ui/ModernButton';
import BentoCard from '@/components/ui/BentoCard';

export default function ConfirmEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; token?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';
  const token = typeof params.token === 'string' ? params.token : '';

  const handleBackToSignIn = () => {
    if (token) {
      router.replace({ pathname: '/invite', params: { token } });
      return;
    }

    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <BentoCard tone="highlight" style={styles.card}>
          <Text style={styles.title}>Registration successful</Text>
          <Text style={styles.body}>
            Your NestLedger account has been created.
          </Text>
          <Text style={styles.body}>
            Confirm your email{email ? ` for ${email}` : ''}, then come back and sign in to continue.
          </Text>
          <View style={styles.spacer} />
          <ModernButton onPress={handleBackToSignIn} text="Back to Sign in" />
        </BentoCard>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: theme.text,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    gap: 10,
    padding: 24,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  screen: {
    backgroundColor: theme.background,
    flex: 1,
  },
  spacer: {
    height: 10,
  },
  title: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '800',
  },
});
