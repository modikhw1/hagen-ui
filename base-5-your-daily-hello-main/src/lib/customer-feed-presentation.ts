import { getCustomerConceptPlacementBucketLabel } from '@/lib/customer-concept-lifecycle';
import type { CustomerFeedSlot, CustomerFeedStatus } from '@/types/customer-feed';

type FeedStatusStyle = {
  bg: string;
  text: string;
};

export const CUSTOMER_FEED_STATUS_STYLES: Record<CustomerFeedStatus, FeedStatusStyle> = {
  current_in_plan: { bg: '#ede9fe', text: '#6d28d9' },
  planned: { bg: '#dbeafe', text: '#1d4ed8' },
  produced_clip: { bg: '#dcfce7', text: '#166534' },
  published_clip: { bg: '#bbf7d0', text: '#14532d' },
};

export function getCustomerFeedMetaLabel(slot: Pick<
  CustomerFeedSlot,
  'placement' | 'result'
>): string {
  if (slot.result.publishedAt) return `Publicerad ${formatLifecycleDate(slot.result.publishedAt)}`;
  if (slot.result.producedAt) return `Producerad ${formatLifecycleDate(slot.result.producedAt)}`;
  if (slot.result.sharedAt) return `Delad ${formatLifecycleDate(slot.result.sharedAt)}`;

  return getCustomerConceptPlacementBucketLabel(slot.placement.bucket, 'customer') ?? 'Planerad';
}

export function getCustomerOriginalReferenceLabel(): string {
  return 'Originalreferens';
}

function formatLifecycleDate(value: string): string {
  return new Date(value).toLocaleDateString('sv-SE');
}
