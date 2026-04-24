'use client';

import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';

type Props = {
  columnKey: string;
  label: string;
  count: number;
  focused: boolean;
  children: ReactNode;
};

export function DemoColumn({ columnKey, label, count, focused, children }: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: columnKey,
    data: {
      columnKey,
    },
  });

  return (
    <section
      ref={setNodeRef}
      data-demo-column={columnKey}
      className={`rounded-xl border bg-card p-4 transition-colors ${
        focused ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border'
      } ${isOver ? 'border-primary bg-primary/5' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
