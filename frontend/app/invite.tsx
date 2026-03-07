import { useLocalSearchParams } from 'expo-router';

import NestLedgerApp from '@/components/nestledger/NestLedgerApp';

export default function InviteScreen() {
  const params = useLocalSearchParams<{ token?: string }>();

  return <NestLedgerApp initialInviteToken={params.token} />;
}