'use client';

import { useState } from 'react';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { oreToSek, sekToOre } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import { CustomerSection, CustomerSectionSkeleton, CustomerField } from '@/components/admin/customers/routes/shared';
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
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <InlineEditField
          label="Företagsnamn"
          value={customer.business_name}
          onSave={async (next) => {
            await update.mutateAsync({ business_name: String(next) });
          }}
          validate={(raw) => !raw.trim() ? 'Namnet kan inte vara tomt' : null}
          className="sm:col-span-2 border-b border-border/50 pb-5 mb-1"
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

        <CustomerField 
          label="Intervall" 
          value={customer.subscription_interval === 'month' ? 'Månadsvis' : 
                 customer.subscription_interval === 'quarter' ? 'Kvartalsvis' : 
                 customer.subscription_interval === 'year' ? 'Årsvis' : customer.subscription_interval || '—'} 
        />

        <CustomerField 
          label="Nästa faktura" 
          value={shortDateSv(customer.next_invoice_date) ?? '—'} 
        />

        <CustomerField 
          label="Kund sedan" 
          value={shortDateSv(customer.created_at) ?? '—'} 
        />

        <div className="sm:col-span-2 border-t border-border/50 pt-5 mt-1">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rabatt</div>
            <button 
              onClick={() => setDiscountOpen(true)}
              className="text-[10px] font-bold text-primary hover:text-primary/80 uppercase tracking-tight transition-colors"
            >
              Hantera
            </button>
          </div>
          <DiscountPreview customer={customer} />
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
