import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { network } from '@/lib/network';
import { offlineStore, syncExpenses } from '@/lib/offline';
import { supabase } from '@/lib/supabase';

export function useOfflineSync(userId: string | undefined, profileId: string | null,
  refresh: (profileId: string, force?: boolean) => Promise<void>) {
  const [online, setOnline] = useState(network.isOnline);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const generation = useRef(0);
  const running = useRef(false);

  useEffect(() => network.subscribe(() => setOnline(network.isOnline())), []);

  useEffect(() => {
    let active = true;
    setPending(0);
    setError(null);
    const update = async () => {
      if (!userId) return;
      try {
        const status = await offlineStore.status();
        if (active) { setPending(status.pending); setError(status.error); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Cannot read saved expenses.');
      }
    };
    void update();
    const unsubscribe = offlineStore.subscribe(() => { void update(); });
    return () => { active = false; unsubscribe(); };
  }, [userId]);

  const synchronize = useCallback(async (retryErrors = false) => {
    if (!userId || !network.isOnline() || AppState.currentState !== 'active' || running.current) return;
    const current = generation.current;
    running.current = true;
    setSyncing(true);
    try {
      const { data, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      if (data.session?.user.id !== userId || current !== generation.current) return;
      await syncExpenses(retryErrors);
      if (profileId && current === generation.current) await refresh(profileId, true);
    } catch (cause) {
      if (network.isOnline() && current === generation.current) {
        setError((cause as { message?: string }).message ?? 'Cannot sync saved expenses.');
      }
    } finally {
      running.current = false;
      if (current === generation.current) setSyncing(false);
    }
  }, [userId, profileId, refresh]);

  useEffect(() => {
    const current = ++generation.current;
    setSyncing(false);
    return () => { generation.current = current + 1; };
  }, [userId, profileId]);

  useEffect(() => {
    if (!online || AppState.currentState !== 'active') {
      void supabase.auth.stopAutoRefresh();
      return;
    }
    void supabase.auth.startAutoRefresh();
    void synchronize(true);
    return () => { void supabase.auth.stopAutoRefresh(); };
  }, [online, synchronize]);

  useEffect(() => {
    if (pending && online && !error) void synchronize();
  }, [pending, online, error, synchronize]);

  useEffect(() => {
    const check = async () => {
      if (AppState.currentState !== 'active') return;
      const wasOnline = network.isOnline();
      if (await network.check()) {
        if (wasOnline && userId && (await offlineStore.status()).pending) void synchronize();
      }
    };
    void check().catch(() => undefined);
    // No database polling while offline: only a short reachability probe in the foreground.
    const timer = setInterval(() => { void check().catch(() => undefined); }, 15000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void check().then(() => {
          if (network.isOnline()) { void supabase.auth.startAutoRefresh(); void synchronize(true); }
        }).catch(() => undefined);
      } else { void supabase.auth.stopAutoRefresh(); }
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [userId, synchronize]);

  return { online, pending, error, syncing, retry: () => synchronize(true) };
}
