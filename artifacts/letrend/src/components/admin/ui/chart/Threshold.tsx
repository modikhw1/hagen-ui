'use client';

export function Threshold({
  y,
  label,
  color = 'hsl(var(--chart-axis))',
}: {
  y: number;
  label?: string;
  color?: string;
}) {
  // Här behöver vi veta y-skalan. 
  // I detta förenklade valideringspass antar vi y=0..max
  // Vi sätter den på ett statiskt y-läge för illustration i demon
  const yPos = 60; 

  return (
    <g>
      <line
        x1="0"
        y1={yPos}
        x2="400"
        y2={yPos}
        stroke={color}
        strokeWidth="1"
        strokeDasharray="4 4"
        style={{ opacity: 0.5 }}
      />
      {label && (
        <text
          x="400"
          y={yPos - 4}
          textAnchor="end"
          fill={color}
          style={{ fontSize: '9px', fontWeight: 'bold' }}
        >
          {label}
        </text>
      )}
    </g>
  );
}
