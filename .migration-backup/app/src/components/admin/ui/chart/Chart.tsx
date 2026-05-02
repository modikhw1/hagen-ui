'use client';

import { ReactNode, useMemo } from 'react';

type Padding = { l: number; r: number; t: number; b: number };

export type ChartProps = {
  height?: number;
  width?: string | number;
  xDomain: [number, number];
  yDomain: [number, number] | 'auto';
  padding?: Partial<Padding>;
  children: ReactNode;
  className?: string;
};

export function Chart({
  height = 120,
  width = '100%',
  xDomain,
  yDomain,
  padding: paddingInput,
  children,
  className,
}: ChartProps) {
  const padding: Padding = { l: 40, r: 10, t: 10, b: 20, ...paddingInput };
  
  // Vi använder en fast viewBox för skalfri rendering i SVG
  const viewBox = `0 0 400 ${height}`;
  
  return (
    <div className={className} style={{ width, height: 'auto' }}>
      <svg
        viewBox={viewBox}
        preserveAspectRatio="none"
        className="overflow-visible"
        style={{ width: '100%', height: `${height}px` }}
      >
        {children}
      </svg>
    </div>
  );
}
