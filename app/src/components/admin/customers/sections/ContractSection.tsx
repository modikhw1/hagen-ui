'use client';

import { useState } from 'react';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { oreToSek, sekToOre } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import { CustomerSection, CustomerSectionSkeleton } from '@/components/admin/customers/routes/shared';
import { InlineEditField } from '@/components/admin/ui/form/InlineEditField';
import { DiscountPreview } from '../modals/DiscountPreview';
import DiscountModal from '../modals/DiscountModal';

export default function ContractSection({ customerId }: { customerId: string }) {
  const { data: customer, isLoading } = useCustomerDetail(customerId);
  const update = useCustomerMutation(customerId, 'update_profile');
  const [discountOpen, setDiscountOpen] = useState(false);

  if (isLoading) return <CustomerSectionSkeleton blocks={2} />;
  if (!customer) return null;

  return (
    <CustomerSection title="Avtal & pris">
      <div className="grid gap-6 sm:grid-cols-2">
        <InlineEditField
          label="Företagsnamn"
          value={customer.business_name}
          onSave={async (next) => {
            await update.mutateAsync({ business_name: String(next) });
          }}
          validate={(raw) => !raw.trim() ? 'Namnet kan inte vara tomt' : null}
          className="sm:col-span-2 border-b border-border pb-4 mb-2"
        />

        <InlineEditField
          label="Månadspris"
          value={oreToSek(customer.monthly_price ?? 0)}
          inputType="number"
          format={(v) => v == null || v === '' ? '—' : `${Number(v).toLocaleString('sv-SE')} kr`}
          parse={(raw) => sekToOre(Number(raw) || 0)}
          onSave={async (next) => {
            await update.mutateAsync({ monthly_price: next as number });
          }}
          validate={(raw) => Number(raw) < 0 ? 'Priset kan inte vara negativt' : null}
        />

        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Faktureringsintervall</div>
          <div className="text-sm text-foreground">
            {customer.subscription_interval === 'month' ? 'Månadsvis' : 
             customer.subscription_interval === 'quarter' ? 'Kvartalsvis' : 
             customer.subscription_interval === 'year' ? 'Årsvis' : customer.subscription_interval}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Nästa faktura</div>
          <div className="text-sm text-foreground">{shortDateSv(customer.next_invoice_date) ?? '—'}</div>
        </div>

        <div className="space-y-1 sm:col-span-2 border-t border-border pt-4 mt-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Rabatt</div>
            <button 
              onClick={() => setDiscountOpen(true)}
              className="text-[10px] font-semibold text-primary hover:underline uppercase"
            >
              Hantera
            </button>
          </div>
          <DiscountPreview customer={customer} className="mt-1" />
        </div>
      </div>

      <DiscountModal
        open={discountOpen}
        onClose={() => setDiscountOpen(false)}
        customerId={customerId}
        customer={customer}
      />
    </CustomerSection>
  );
}

function formatSek(ore: number) {
  return `${(ore / 100).toLocaleString('sv-SE')} kr`;
}
