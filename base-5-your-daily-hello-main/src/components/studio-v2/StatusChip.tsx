'use client';

import {
  getCustomerConceptAssignmentLabel,
  getNextCustomerConceptAssignmentStatus,
  getStudioAssignmentStatusLabel,
} from '@/lib/customer-concept-lifecycle';
import type { CustomerConceptAssignmentStatus } from '@/types/customer-lifecycle';

interface StatusChipProps {
  status: CustomerConceptAssignmentStatus;
  editable?: boolean;
  onClick?: () => void;
}

const STATUS_NEXT_STEP_COPY: Partial<Record<CustomerConceptAssignmentStatus, string>> = {
  draft: 'Nasta steg: dela konceptet med kunden nar copy, manus och passning ar redo.',
  sent: 'Nasta steg: markera som producerad nar klippet ar filmat eller publicerat.',
  produced: 'Nasta steg: arkivera nar resultatet ar dokumenterat och konceptet inte langre behover foljas upp.',
};

const STATUS_STYLES: Record<CustomerConceptAssignmentStatus, { bg: string; color: string; border: string }> = {
  draft: { bg: 'rgba(245, 158, 11, 0.12)', color: '#b45309', border: '#f59e0b' },
  sent: { bg: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8', border: '#3b82f6' },
  produced: { bg: 'rgba(16, 185, 129, 0.12)', color: '#047857', border: '#10b981' },
  archived: { bg: 'rgba(107, 114, 128, 0.12)', color: '#4b5563', border: '#9ca3af' },
};

export function StatusChip({ status, editable = false, onClick }: StatusChipProps) {
  const style = STATUS_STYLES[status];
  const nextStatus = getNextCustomerConceptAssignmentStatus(status);
  const title = editable && nextStatus
    ? `${getStudioAssignmentStatusLabel(status)}. Klicka for att ga vidare till ${getCustomerConceptAssignmentLabel(nextStatus)}. ${STATUS_NEXT_STEP_COPY[status] ?? ''}`.trim()
    : `${getStudioAssignmentStatusLabel(status)}.`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!editable}
      title={title}
      style={{
        border: `1px solid ${style.border}`,
        background: style.bg,
        color: style.color,
        padding: '4px 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        cursor: editable ? 'pointer' : 'default',
      }}
    >
      {getStudioAssignmentStatusLabel(status)}
    </button>
  );
}
