'use client';

import { Tooltip, Box } from '@mantine/core';
import { cn } from '@/lib/utils';

export default function WorkflowDot({ 
  active, 
  label 
}: { 
  active: boolean;
  label: string;
}) {
  return (
    <Tooltip label={label} position="top" withArrow>
      <Box
        component="span"
        className={cn(
          "h-2 w-2 rounded-full transition-colors inline-block",
          active ? "bg-status-success-fg" : "bg-muted hover:bg-muted-foreground/30"
        )}
      />
    </Tooltip>
  );
}
