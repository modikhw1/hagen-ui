'use client';
import { useEffect } from 'react';
import { useRouter } from '@/lib/navigation-compat';

export default function MobileEntryPage() {
  const router = useRouter();

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const isLegacyDemo = sp.get('demo') === 'true' || sp.get('auth') === 'true';

    if (isLegacyDemo) {
      const next = new URLSearchParams();
      if (sp.get('auth') === 'true') next.set('auth', 'true');
      const suffix = next.size > 0 ? `?${next.toString()}` : '';
      router.replace(`/m/legacy-demo${suffix}`);
    } else {
      router.replace('/m/feed');
    }
  }, []);

  return null;
}
