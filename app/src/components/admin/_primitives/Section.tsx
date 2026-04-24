import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
  titleClassName?: string;
};

const AdminSection = ({ title, children, className, titleClassName }: Props) => {
  return (
    <section className={cn('grid gap-3', className)}>
      <div
        className={cn(
          'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
          titleClassName,
        )}
      >
        {title}
      </div>
      {children}
    </section>
  );
};

export { AdminSection as Section };
