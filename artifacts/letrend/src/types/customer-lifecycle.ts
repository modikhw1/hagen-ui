export type CustomerConceptAssignmentStatus =
  | 'draft'
  | 'sent'
  | 'produced'
  | 'archived';

export type LegacyCustomerConceptRowStatus =
  | 'active'
  | 'paused'
  | 'completed';

export type CustomerConceptRowStatus =
  | CustomerConceptAssignmentStatus
  | LegacyCustomerConceptRowStatus;

export type CustomerConceptPlacementBucket =
  | 'current'
  | 'upcoming'
  | 'history';

export type CustomerConceptFeedStatus =
  | 'current_in_plan'
  | 'planned'
  | 'produced_clip'
  | 'published_clip';
