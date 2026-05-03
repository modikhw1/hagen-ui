import type { LucideIcon } from 'lucide-react';

export default function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 px-4 py-5 text-sm text-muted-foreground">
      <div className="flex items-start gap-3">
        {Icon ? (
          <div className="rounded-full border border-border bg-card p-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div>
          <div className="font-medium text-foreground">{title}</div>
          {hint ? <div className="mt-1">{hint}</div> : null}
        </div>
      </div>
    </div>
  );
}
