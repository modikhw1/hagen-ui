'use client';

import { useMemo } from 'react';

export type LineSeriesProps = {
  data: Array<{ x: number; y: number }>;
  smoothed?: boolean;
  className?: string;
  stroke?: string;
  strokeWidth?: number;
};

export function LineSeries({
  data,
  smoothed = false,
  className,
  stroke = 'hsl(var(--chart-line-primary))',
  strokeWidth = 2,
}: LineSeriesProps) {
  const points = useMemo(() => {
    if (data.length < 2) return '';
    
    // Enkel skalning för vår fasta 400xH viewBox
    // (I en riktig implementation skulle vi använda d3-scale eller skicka ner domäner från Chart)
    // För detta valideringspass gör vi en linjär mappning baserat på data-omfång i x/y
    const minX = Math.min(...data.map(d => d.x));
    const maxX = Math.max(...data.map(d => d.x));
    const minY = Math.min(...data.map(d => d.y));
    const maxY = Math.max(...data.map(d => d.y));
    
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    return data.map(d => {
      const px = ((d.x - minX) / rangeX) * 400;
      const py = 120 - ((d.y - minY) / rangeY) * 100 - 10; // offset för padding
      return `${px},${py}`;
    }).join(' ');
  }, [data]);

  if (!points) return null;

  return (
    <g className={className}>
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {smoothed && (
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.4, strokeDasharray: '4 3' }}
        />
      )}
    </g>
  );
}
