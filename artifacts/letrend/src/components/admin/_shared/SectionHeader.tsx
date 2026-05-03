import type { ReactNode } from 'react';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export default function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}
