import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dispatch, SetStateAction, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';

import { isConfigReady } from '@/lib/config';
import { authApi, profileApi, HouseholdProfile, UserProfile } from '@/lib/nestledger';
import { supabase } from '@/lib/supabase';
import { getCached } from '@/lib/offline';

type UseNestLedgerBootstrapOptions = {
  activeProfileId: string | null;
  online: boolean;
  onSchemaMissing: (message: string) => boolean;
  onSessionCleared: () => void;
  setActiveProfileId: Dispatch<SetStateAction<string | null>>;
  setBooting: Dispatch<SetStateAction<boolean>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setProfileLoaded: Dispatch<SetStateAction<boolean>>;
  setProfiles: Dispatch<SetStateAction<HouseholdProfile[]>>;
  setSession: Dispatch<SetStateAction<Session | null>>;
  setSetupMessage: Dispatch<SetStateAction<string | null>>;
  setUserProfile: Dispatch<SetStateAction<UserProfile | null>>;
  sessionUserId: string | undefined;
};

const extractError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const errorObj = error as { details?: string; error?: { message?: string }; message?: string };
    if (errorObj.message) return errorObj.message;
    if (errorObj.error?.message) return errorObj.error.message;
    if (errorObj.details) return errorObj.details;
  }

  return 'Something went wrong.';
};

export function useNestLedgerBootstrap({
  activeProfileId,
  online,
  onSchemaMissing,
  onSessionCleared,
  setActiveProfileId,
  setBooting,
  setBusy,
  setProfileLoaded,
  setProfiles,
  setSession,
  setSetupMessage,
  setUserProfile,
  sessionUserId,
}: UseNestLedgerBootstrapOptions) {
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      if (!isConfigReady) {
        setBooting(false);
        return;
      }

      try {
        const currentSession = await authApi.getSession();
        if (mounted) {
          setSession(currentSession);
        }
      } catch (error) {
        if (mounted) {
          setSetupMessage(extractError(error));
        }
      } finally {
        if (mounted) {
          setBooting(false);
        }
      }
    };

    initialize();

    const subscription = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!nextSession && event !== 'SIGNED_OUT') return;
      setSession(nextSession);
      if (!nextSession) {
        onSessionCleared();
      }
    });

    return () => {
      mounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, [onSessionCleared, setBooting, setSession, setSetupMessage]);

  useEffect(() => {
    if (!sessionUserId) {
      return;
    }

    let mounted = true;
    const bootstrap = async () => {
      const [cachedUser, cachedProfiles] = await Promise.all([
        getCached<UserProfile | null>(`user-profile:${sessionUserId}`),
        getCached<HouseholdProfile[]>(`profiles:${sessionUserId}`),
      ]);
      if (!mounted) return;
      const savedId = await AsyncStorage.getItem(`nestledger-active-profile-${sessionUserId}`);
      if (!mounted) return;
      if (cachedProfiles) {
        setUserProfile(cachedUser ?? null);
        setProfiles(cachedProfiles);
        setProfileLoaded(true);
        setActiveProfileId((previous) => cachedProfiles.some((item) => item.id === previous)
          ? previous : cachedProfiles.find((item) => item.id === savedId)?.id ?? cachedProfiles[0]?.id ?? null);
      }
      setBusy(!cachedProfiles && online);

      try {
        const [nextUserProfile, nextProfiles] = await Promise.all([
          profileApi.fetchUserProfile(sessionUserId),
          profileApi.fetchAccessibleProfiles(sessionUserId),
        ]);
        if (!mounted) return;

        setUserProfile(nextUserProfile);
        setProfiles(nextProfiles);
        setProfileLoaded(true);

        const fallback =
          nextProfiles.find((item) => item.id === savedId)?.id ?? nextProfiles[0]?.id ?? null;
        setActiveProfileId((previous) => nextProfiles.some((item) => item.id === previous) ? previous : fallback);
        setSetupMessage(null);
      } catch (error) {
        if (!mounted) return;
        const message = extractError(error);
        setProfileLoaded(true);
        if (onSchemaMissing(message)) {
          setSetupMessage(
            'Supabase tables are not ready yet. Run /app/backend/supabase_schema.sql in Supabase SQL Editor or send the Transaction Pooler URI so I can apply it for you.',
          );
        } else {
          setSetupMessage(message);
        }
      } finally {
        if (mounted) setBusy(false);
      }
    };

    void bootstrap().catch((error) => {
      if (mounted) { setSetupMessage(extractError(error)); setProfileLoaded(true); setBusy(false); }
    });
    return () => { mounted = false; };
  }, [
    online,
    onSchemaMissing,
    sessionUserId,
    setActiveProfileId,
    setBusy,
    setProfileLoaded,
    setProfiles,
    setSetupMessage,
    setUserProfile,
  ]);

  useEffect(() => {
    if (!sessionUserId || !activeProfileId) {
      return;
    }

    AsyncStorage.setItem(`nestledger-active-profile-${sessionUserId}`, activeProfileId).catch(
      () => undefined,
    );
  }, [activeProfileId, sessionUserId]);
}
