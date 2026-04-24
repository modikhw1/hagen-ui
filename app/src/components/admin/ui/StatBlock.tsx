import SummaryCard, { type SummaryCardProps } from './SummaryCard';

export type StatBlockProps = SummaryCardProps;

export function StatBlock(props: StatBlockProps) {
  return <SummaryCard compact {...props} />;
}
