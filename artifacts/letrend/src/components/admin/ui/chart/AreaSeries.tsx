'use client';

import { useMemo } from 'react';

export function AreaSeries({
  data,
  fill = 'hsl(var(--chart-area-primary))',
  className,
}: {
  data: Array<{ x: number; y: number }>;
  fill?: string;
  className?: string;
}) {
  const points = useMemo(() => {
    if (data.length < 2) return '';
    
    const minX = Math.min(...data.map(d => d.x));
    const maxX = Math.max(...data.map(d => d.x));
    const minY = Math.min(...data.map(d => d.y));
    const maxY = Math.max(...data.map(d => d.y));
    
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const linePoints = data.map(d => {
      const px = ((d.x - minX) / rangeX) * 400;
      const py = 120 - ((d.y - minY) / rangeY) * 100 - 10;
      return `${px},${py}`;
    });

    const firstX = 0;
    const lastX = 400;
    const baseline = 120;

    return `${firstX},${baseline} ${linePoints.join(' ')} ${lastX},${baseline}`;
  }, [data]);

  if (!points) return null;

  return (
    <polygon
      points={points}
      fill={fill}
      className={className}
      style={{ opacity: 0.15 }}
    />
  );
}
