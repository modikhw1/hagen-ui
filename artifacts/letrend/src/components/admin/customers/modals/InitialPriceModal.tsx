'use client';

import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import ContractEditForm from '@/components/admin/customers/ContractEditForm';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';

export interface InitialPriceModalProps {
  open: boolean;
  onClose: () => void;
  customerId: string;
}

export function InitialPriceModal({ open, onClose, customerId }: InitialPriceModalProps) {
  const { data: customer, isLoading } = useCustomerDetail(customerId);
  const refresh = useAdminRefresh();

  return (
    <AdminFormDialog
      open={open}
      onClose={onClose}
      title="Sätt inledande pris"
      description={customer?.business_name ?? undefined}
      size="md"
    >
      {isLoading || !customer ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Laddar…</div>
      ) : (
        <ContractEditForm
          customer={customer}
          onSaved={async () => {
            await refresh([
              { type: 'customer', customerId },
              { type: 'customer-billing', customerId },
              'customers',
            ]);
            onClose();
          }}
        />
      )}
    </AdminFormDialog>
  );
}
