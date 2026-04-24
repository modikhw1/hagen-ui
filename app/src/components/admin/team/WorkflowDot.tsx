'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export default function WorkflowDot({ 
  active, 
  label 
}: { 
  active: boolean;
  label: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            "h-2 w-2 rounded-full transition-colors",
            active ? "bg-status-success-fg" : "bg-muted hover:bg-muted-foreground/30"
          )} />
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-[10px]">{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
