import { useEffect, useState } from 'react';

import { CURRENCY_INFO } from '@/constants/nestledger';
import { fetchLiveCurrencyCodes } from '@/lib/currencyApi';

// Renders the curated list immediately, then widens it to whatever the live
// provider currently supports. A failure just leaves the curated list, so the
// fetch is never worth caching or awaiting.
export function useCurrencyCodes(): string[] {
  const [codes, setCodes] = useState<string[]>(() => Object.keys(CURRENCY_INFO));

  useEffect(() => {
    let active = true;

    void fetchLiveCurrencyCodes().then((incoming) => {
      if (!active || !incoming.length) return;
      setCodes((current) => [...new Set([...current, ...incoming])].sort());
    });

    return () => {
      active = false;
    };
  }, []);

  return codes;
}
