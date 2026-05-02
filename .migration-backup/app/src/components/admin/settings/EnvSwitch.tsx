'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { OPERATOR_COPY } from '@/lib/admin/copy/operator-glossary';
import { cn } from '@/lib/utils';

export function EnvSwitch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentEnv = searchParams?.get('env') || 'live';

  const setEnv = (env: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (env === 'live') {
      params.delete('env');
    } else {
      params.set('env', env);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex gap-1 rounded-md border border-border bg-secondary p-1 w-fit">
      {[
        { id: 'live', label: OPERATOR_COPY.env.liveBadge },
        { id: 'test', label: OPERATOR_COPY.env.testBadge },
      ].map((item) => (
        <button
          key={item.id}
          onClick={() => setEnv(item.id)}
          className={cn(
            'rounded px-3 py-1.5 text-xs font-semibold transition-colors',
            currentEnv === item.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
