import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  children: ReactNode;
  className?: string;
  htmlFor?: string;
};

const AdminLabel = ({ children, className, htmlFor }: Props) => {
  const Component = htmlFor ? 'label' : 'div';

  return (
    <Component
      {...(htmlFor ? { htmlFor } : {})}
      className={cn('text-[11px] uppercase tracking-wider text-muted-foreground', className)}
    >
      {children}
    </Component>
  );
};

export { AdminLabel as Label };
