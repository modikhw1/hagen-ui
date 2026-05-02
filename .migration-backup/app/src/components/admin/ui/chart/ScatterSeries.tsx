'use client';

export type ScatterPoint = {
  x: number;
  y: number;
  [key: string]: any;
};

export function ScatterSeries({
  points,
  color = (p) => 'hsl(var(--chart-point-default))',
  radius = (p) => 4,
  onHover,
}: {
  points: ScatterPoint[];
  color?: (p: ScatterPoint) => string;
  radius?: (p: ScatterPoint) => number;
  onHover?: (p: ScatterPoint | null) => void;
}) {
  if (points.length === 0) return null;

  const minX = Math.min(...points.map(d => d.x));
  const maxX = Math.max(...points.map(d => d.x));
  const minY = Math.min(...points.map(d => d.y));
  const maxY = Math.max(...points.map(d => d.y));
  
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  return (
    <g>
      {points.map((p, i) => {
        const cx = ((p.x - minX) / rangeX) * 400;
        const cy = 120 - ((p.y - minY) / rangeY) * 100 - 10;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={radius(p)}
            fill={color(p)}
            className="transition-all hover:opacity-80 cursor-pointer"
            onMouseEnter={() => onHover?.(p)}
            onMouseLeave={() => onHover?.(null)}
          />
        );
      })}
    </g>
  );
}
