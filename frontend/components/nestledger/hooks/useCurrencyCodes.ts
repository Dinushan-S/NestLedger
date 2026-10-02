import { useEffect, useState } from 'react';

import { CURRENCY_INFO } from '@/constants/nestledger';
import { fetchLiveCurrencyCodes } from '@/lib/currencyApi';

// Renders the curated list immediately, then widens it to whatever the live
// provider currently supports. A failure just leaves the curated list, so the
// fetch is never worth caching or awaiting.
//
// ponytail: the widening adds ~120 codes with no CURRENCY_INFO entry, so on a
// trimmed-ICU engine those render as a bare ticker ("AFN 1,235") and the picker
// shows the code twice with no name, because Hermes has no Intl.DisplayNames.
// Accepted for now: the 46 curated codes cover the major household currencies and
// all of them render as money. Fix by curating the codes that actually get picked,
// or by giving symbolFor a last-resort glyph. Note there is no cache or in-flight
// guard, so this refetches on every mount of its host (the sheet is always
// mounted behind a visible toggle).
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
