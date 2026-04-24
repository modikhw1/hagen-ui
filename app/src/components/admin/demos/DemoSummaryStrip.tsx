'use client';

import { StatBlock } from '@/components/admin/shared/StatBlock';
import { demosCopy } from '@/lib/admin/copy/demos';

type Props = {
  sentLast30: number;
  sentPrev30: number;
  convertedLast30: number;
  convertedPrev30: number;
  totalOnBoard: number;
};

export function DemoSummaryStrip({
  sentLast30,
  sentPrev30,
  convertedLast30,
  convertedPrev30,
  totalOnBoard,
}: Props) {
  const sentDelta = sentLast30 - sentPrev30;
  const convertedDelta = convertedLast30 - convertedPrev30;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <StatBlock
        label={demosCopy.summarySent30}
        value={String(sentLast30)}
        delta={sentDelta}
        trend={sentDelta > 0 ? 'up' : sentDelta < 0 ? 'down' : 'flat'}
      />
      <StatBlock
        label={demosCopy.summaryConverted30}
        value={String(convertedLast30)}
        delta={convertedDelta}
        trend={convertedDelta > 0 ? 'up' : convertedDelta < 0 ? 'down' : 'flat'}
      />
      <StatBlock label={demosCopy.summaryTotal} value={String(totalOnBoard)} />
    </div>
  );
}
