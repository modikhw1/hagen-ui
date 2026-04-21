'use client';

export function smoothData(data: number[], windowSize: number): number[] {
  const result: number[] = [];

  for (let index = 0; index < data.length; index += 1) {
    const start = Math.max(0, index - Math.floor(windowSize / 2));
    const end = Math.min(data.length, index + Math.ceil(windowSize / 2));
    const slice = data.slice(start, end);
    result.push(slice.reduce((sum, value) => sum + value, 0) / slice.length);
  }

  return result;
}

export function ChartSVG({
  data,
  smoothed,
  height = 80,
  color = 'hsl(var(--primary))',
  smoothColor = 'hsl(var(--muted-foreground))',
}: {
  data: number[];
  smoothed?: number[];
  height?: number;
  color?: string;
  smoothColor?: string;
}) {
  const width = 400;
  const all = [...data, ...(smoothed || [])];
  const max = Math.max(...all, 1);
  const min = Math.min(...all);
  const range = max - min || 1;
  const pad = 4;

  const toPoints = (values: number[]) =>
    values
      .map((value, index) => {
        const x = values.length > 1 ? (index / (values.length - 1)) * width : 0;
        const y = height - ((value - min) / range) * (height - pad * 2) - pad;
        return `${x},${y}`;
      })
      .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
      {smoothed && smoothed.length > 0 && (
        <polyline
          points={toPoints(smoothed)}
          fill="none"
          stroke={smoothColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 3"
          opacity={0.5}
        />
      )}
      <polyline
        points={toPoints(data)}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ViewsScatterChart({
  videos,
  hitThreshold,
  viralThreshold,
  windowEndIso,
  windowDays = 30,
  height = 160,
}: {
  videos: Array<{
    uploaded_at: string;
    views: number;
    likes: number;
  }>;
  hitThreshold: number;
  viralThreshold: number;
  windowEndIso: string;
  windowDays?: number;
  height?: number;
}) {
  const width = 600;
  const padL = 40;
  const padR = 8;
  const padT = 10;
  const padB = 18;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const end = new Date(windowEndIso).getTime();
  const fallbackEnd = Math.max(
    ...videos.map((video) => new Date(video.uploaded_at).getTime()).filter(Number.isFinite),
    1
  );
  const safeEnd = Number.isFinite(end) ? end : fallbackEnd;
  const start = safeEnd - windowDays * 24 * 60 * 60 * 1000;
  const sorted = [...videos]
    .filter((video) => new Date(video.uploaded_at).getTime() >= start)
    .sort(
      (left, right) =>
        new Date(left.uploaded_at).getTime() - new Date(right.uploaded_at).getTime()
    );

  const maxView = Math.max(viralThreshold * 1.15, ...sorted.map((video) => video.views), 1);
  const scaleY = (value: number) => {
    const normalized = Math.sqrt(Math.max(0, value)) / Math.sqrt(maxView);
    return padT + innerH - normalized * innerH;
  };
  const scaleX = (iso: string) => {
    const time = new Date(iso).getTime();
    const ratio = (time - start) / Math.max(1, safeEnd - start);
    return padL + Math.max(0, Math.min(1, ratio)) * innerW;
  };

  const meanPoints: Array<{ x: number; y: number }> = [];

  for (const video of sorted) {
    const center = new Date(video.uploaded_at).getTime();
    const halfWindow = 7 * 24 * 60 * 60 * 1000;
    const windowVideos = sorted.filter((video) => {
      const time = new Date(video.uploaded_at).getTime();
      return time >= center - halfWindow && time <= center + halfWindow;
    });

    if (windowVideos.length === 0) {
      continue;
    }

    const averageViews =
      windowVideos.reduce((sum, video) => sum + video.views, 0) / windowVideos.length;

    meanPoints.push({
      x: scaleX(video.uploaded_at),
      y: scaleY(averageViews),
    });
  }

  const meanPath = meanPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const yHit = scaleY(hitThreshold);
  const yViral = scaleY(viralThreshold);
  const yTicks = [0, hitThreshold, viralThreshold].filter((value) => value <= maxView);
  const formatAxis = (value: number) =>
    value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
      <line
        x1={padL}
        y1={padT + innerH}
        x2={width - padR}
        y2={padT + innerH}
        stroke="hsl(var(--border))"
        strokeWidth="1"
      />

      {yTicks.map((value) => {
        const y = scaleY(value);
        return (
          <g key={value}>
            <line
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="hsl(var(--border))"
              strokeWidth="0.5"
              strokeDasharray="2 3"
              opacity="0.5"
            />
            <text
              x={padL - 4}
              y={y + 3}
              textAnchor="end"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
            >
              {formatAxis(value)}
            </text>
          </g>
        );
      })}

      <line
        x1={padL}
        y1={yHit}
        x2={width - padR}
        y2={yHit}
        stroke="hsl(var(--info))"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.7"
      />
      <text
        x={width - padR - 2}
        y={yHit - 3}
        textAnchor="end"
        fontSize="8"
        fill="hsl(var(--info))"
        opacity="0.9"
      >
        hit
      </text>

      <line
        x1={padL}
        y1={yViral}
        x2={width - padR}
        y2={yViral}
        stroke="hsl(var(--success))"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.8"
      />
      <text
        x={width - padR - 2}
        y={yViral - 3}
        textAnchor="end"
        fontSize="8"
        fill="hsl(var(--success))"
        opacity="0.95"
      >
        viral
      </text>

      {meanPath ? (
        <path
          d={meanPath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
      ) : null}

      {sorted.map((video, index) => {
        let fill = 'hsl(var(--muted-foreground))';
        if (video.views >= viralThreshold) {
          fill = 'hsl(var(--success))';
        } else if (video.views >= hitThreshold) {
          fill = 'hsl(var(--info))';
        }

        return (
          <circle
            key={`${video.uploaded_at}-${video.views}-${index}`}
            cx={scaleX(video.uploaded_at)}
            cy={scaleY(video.views)}
            r="4"
            fill={fill}
            stroke="hsl(var(--background))"
            strokeWidth="1.5"
          >
            <title>
              {`${new Date(video.uploaded_at).toLocaleDateString('sv-SE')} · ${video.views.toLocaleString('sv-SE')} visningar · ${video.likes.toLocaleString('sv-SE')} likes`}
            </title>
          </circle>
        );
      })}

      <text x={padL} y={height - 4} fontSize="9" fill="hsl(var(--muted-foreground))">
        30d sedan
      </text>
      <text
        x={width - padR}
        y={height - 4}
        fontSize="9"
        fill="hsl(var(--muted-foreground))"
        textAnchor="end"
      >
        Idag
      </text>
    </svg>
  );
}
