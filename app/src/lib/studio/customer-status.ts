export type StudioCustomerStatus =
  | 'pending'
  | 'active'
  | 'archived'
  | 'invited'
  | 'agreed';

type StudioCustomerStatusMeta = {
  label: string;
  bg: string;
  text: string;
  border: string;
};

const STUDIO_CUSTOMER_STATUS_META: Record<StudioCustomerStatus, StudioCustomerStatusMeta> = {
  active: {
    label: 'Aktiv',
    bg: '#D1FAE5',
    text: '#065F46',
    border: '#6EE7B7',
  },
  pending: {
    label: 'Vantar',
    bg: '#FEF3C7',
    text: '#92400E',
    border: '#FCD34D',
  },
  invited: {
    label: 'Inbjuden',
    bg: '#DBEAFE',
    text: '#1E40AF',
    border: '#93C5FD',
  },
  agreed: {
    label: 'Godkand',
    bg: '#E0E7FF',
    text: '#3730A3',
    border: '#A5B4FC',
  },
  archived: {
    label: 'Arkiverad',
    bg: '#F3F4F6',
    text: '#6B7280',
    border: '#D1D5DB',
  },
};

export function getStudioCustomerStatusMeta(
  status: StudioCustomerStatus
): StudioCustomerStatusMeta {
  return STUDIO_CUSTOMER_STATUS_META[status];
}

export function normalizeStudioCustomerStatus(
  status: string | null | undefined
): StudioCustomerStatus {
  switch (status) {
    case 'active':
    case 'archived':
    case 'invited':
    case 'agreed':
      return status;
    case 'pending':
    default:
      return 'pending';
  }
}
