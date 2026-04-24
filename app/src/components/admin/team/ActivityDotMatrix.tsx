import type { DailyDot } from '@/lib/admin/dtos/team';
import { shortDateSv } from '@/lib/admin/time';

export default function ActivityDotMatrix({ dots }: { dots: DailyDot[] }) {
  return (
    <div
      className="flex items-center gap-1"
      title="Senaste 14 dagarnas aktivitet relativt mot 90-dagarsbaseline"
    >
      {dots.map((dot) => (
        <span
          key={String(dot.date)}
          className={dotClassName(dot)}
          title={`${shortDateSv(dot.date)}: ${dot.count} händelser`}
        />
      ))}
    </div>
  );
}

function dotClassName(dot: DailyDot) {
  const base = 'inline-flex h-2.5 w-2.5 rounded-full border border-border/50';
  if (dot.level === 'empty') return `${base} bg-muted`;
  if (dot.level === 'low') return `${base} bg-primary/30 border-primary/20`;
  if (dot.level === 'mid') return `${base} bg-primary/60 border-primary/40`;
  if (dot.level === 'high' || dot.level === 'peak') return `${base} bg-primary border-primary`;
  return `${base} bg-primary border-primary`;
}



