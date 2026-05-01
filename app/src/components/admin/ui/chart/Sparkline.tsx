'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export function Sparkline({
  data,
  height = 28,
  className,
}: {
  data: number[];
  height?: number;
  className?: string;
}) {
  const points = useMemo(() => {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    return data
      .map((val, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 100 - ((val - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data]);

  if (!points) return null;

  return (
    <div className={cn("w-full opacity-60", className)} style={{ height }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <polyline
          points={points}
          fill="none"
          stroke="hsl(var(--chart-line-primary))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
