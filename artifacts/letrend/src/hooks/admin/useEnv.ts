'use client';

import { useSearchParams } from '@/lib/navigation-compat';

export type AdminEnv = 'test' | 'live' | 'all';

export function useEnv(): AdminEnv {
  const [searchParams] = useSearchParams();
  const env = searchParams?.get('env');
  
  if (env === 'test' || env === 'live') {
    return env;
  }
  
  return 'all';
}
