'use client';

import { useCallback, useState } from 'react';

export function useEditSection<K extends string>() {
  const [active, setActive] = useState<K | null>(null);

  const isActive = useCallback((key: K) => active === key, [active]);
  const toggle = useCallback((key: K) => {
    setActive((current) => (current === key ? null : key));
  }, []);
  const close = useCallback(() => setActive(null), []);

  return {
    active,
    isActive,
    toggle,
    close,
  };
}
