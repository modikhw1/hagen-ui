import { StatusChip } from '@/components/studio-v2/StatusChip';
import { getNextCustomerConceptAssignmentStatus } from '@/lib/customer-concept-lifecycle';
import type { CustomerConceptAssignmentStatus } from '@/types/customer-lifecycle';

interface CustomerConceptStatusEditorProps {
  conceptId: string;
  status: CustomerConceptAssignmentStatus;
  onChangeStatus: (
    conceptId: string,
    newStatus: CustomerConceptAssignmentStatus
  ) => Promise<void>;
}

export function CustomerConceptStatusEditor({
  conceptId,
  status,
  onChangeStatus,
}: CustomerConceptStatusEditorProps) {
  const nextStatus = getNextCustomerConceptAssignmentStatus(status);

  return (
    <StatusChip
      status={status}
      onClick={() => {
        if (!nextStatus) return;
        void onChangeStatus(conceptId, nextStatus);
      }}
      editable={Boolean(nextStatus)}
    />
  );
}
