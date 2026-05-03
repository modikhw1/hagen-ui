'use client';

import { CustomerSection, CustomerSectionSkeleton, CustomerField } from '@/components/admin/customers/routes/shared';
import { InlineEditField } from '@/components/admin/ui/form/InlineEditField';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';

export default function ContactSection({ customerId }: { customerId: string }) {
  const { data: customer, isLoading } = useCustomerDetail(customerId);
  const update = useCustomerMutation(customerId, 'update_profile');

  if (isLoading) return <CustomerSectionSkeleton blocks={3} />;
  if (!customer) return null;

  return (
    <CustomerSection title="Kontaktuppgifter">
      <div className="space-y-5">
        <InlineEditField
          label="E-post"
          value={customer.contact_email}
          inputType="email"
          onSave={async (next) => {
            await update.mutateAsync({ contact_email: String(next) });
          }}
          validate={(raw) => !raw.includes('@') ? 'Ogiltig e-post' : null}
        />
        <InlineEditField
          label="Telefon"
          value={customer.phone || ''}
          inputType="tel"
          placeholder="Ej satt"
          onSave={async (next) => {
            await update.mutateAsync({ phone: String(next) });
          }}
        />
        <InlineEditField
          label="Kontaktperson"
          value={customer.customer_contact_name}
          onSave={async (next) => {
            await update.mutateAsync({ customer_contact_name: String(next) });
          }}
        />
      </div>
    </CustomerSection>
  );
}
