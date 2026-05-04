'use client';

import { useEffect } from 'react';
import { useRouter } from '@/lib/navigation-compat';

export default function StudioRootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/studio/customers');
  }, [router]);

  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
      Omdirigerar...
    </div>
  );
}
