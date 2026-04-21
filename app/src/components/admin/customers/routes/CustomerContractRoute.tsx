'use client';

import { useState } from 'react';
import ContractEditForm from '@/components/admin/customers/ContractEditForm';
import ContactEditForm from '@/components/admin/customers/ContactEditForm';
import DiscountModal from '@/components/admin/customers/modals/DiscountModal';
import { intervalLong } from '@/lib/admin/labels';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { shortDateSv } from '@/lib/admin/time';
import { useCustomerBillingRefresh } from '@/hooks/admin/useAdminRefresh';
import {
  CustomerActionButton,
  CustomerField,
  CustomerRouteError,
  CustomerRouteLoading,
  CustomerSection,
} from './shared';

export default function CustomerContractRoute({ customerId }: { customerId: string }) {
  const { data: customer, isLoading, error } = useCustomerDetail(customerId);
  const refresh = useCustomerBillingRefresh(customerId);
  const [editingPricing, setEditingPricing] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);

  if (isLoading) {
    return <CustomerRouteLoading label="Laddar avtal..." />;
  }

  if (error || !customer) {
    return <CustomerRouteError message={error?.message || 'Kunden hittades inte.'} />;
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <CustomerSection
          title="Avtal & Prissattning"
          action={
            <button
              onClick={() => setEditingPricing((value) => !value)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {editingPricing ? 'Avbryt' : 'Redigera'}
            </button>
          }
        >
          {editingPricing ? (
            <ContractEditForm
              customer={customer}
              onSaved={() => {
                setEditingPricing(false);
                void refresh();
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CustomerField
                label="Manadspris"
                value={
                  (customer.monthly_price ?? 0) > 0
                    ? `${(customer.monthly_price ?? 0).toLocaleString('sv-SE')} kr`
                    : 'Ej satt'
                }
              />
              <CustomerField
                label="Intervall"
                value={intervalLong(customer.subscription_interval)}
              />
              <CustomerField
                label="Kontraktstart"
                value={shortDateSv(customer.contract_start_date)}
              />
              <CustomerField
                label="Faktureringsdag"
                value={customer.billing_day_of_month ?? '-'}
              />
              <CustomerField
                label="Nasta faktura"
                value={shortDateSv(customer.next_invoice_date)}
              />
              <CustomerField
                label="Kund sedan"
                value={shortDateSv(customer.created_at)}
              />
              {customer.upcoming_price_change ? (
                <CustomerField
                  label="Schemalagd prisandring"
                  value={`${customer.upcoming_price_change.price.toLocaleString('sv-SE')} kr från ${shortDateSv(customer.upcoming_price_change.effective_date)}`}
                />
              ) : null}
              {customer.discount_type && customer.discount_type !== 'none' ? (
                <CustomerField
                  label="Rabatt"
                  value={
                    customer.discount_type === 'percent'
                      ? `${customer.discount_value || 0}%`
                      : customer.discount_type === 'amount'
                        ? `${customer.discount_value || 0} kr`
                        : `${customer.discount_value || 0} gratis manader`
                  }
                />
              ) : null}
            </div>
          )}
        </CustomerSection>

        <CustomerSection title="Avtalsatgarder">
          <div className="space-y-2">
            <CustomerActionButton onClick={() => setShowDiscountModal(true)}>
              Hantera rabatt
            </CustomerActionButton>
          </div>
        </CustomerSection>
      </div>

      <CustomerSection
        title="Kontaktuppgifter"
        action={
          <button
            onClick={() => setEditingContact((value) => !value)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {editingContact ? 'Avbryt' : 'Redigera'}
          </button>
        }
      >
        {editingContact ? (
          <ContactEditForm
            customer={customer}
            onSaved={() => {
              setEditingContact(false);
              void refresh();
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CustomerField label="Foretag" value={customer.business_name} />
            <CustomerField label="E-post" value={customer.contact_email} />
            <CustomerField
              label="Kontaktperson"
              value={customer.customer_contact_name || '-'}
            />
            <CustomerField label="Telefon" value={customer.phone || '-'} />
          </div>
        )}
      </CustomerSection>

      <DiscountModal
        open={showDiscountModal}
        customerId={customerId}
        customerName={customer.business_name}
        onClose={() => setShowDiscountModal(false)}
        onApplied={() => {
          setShowDiscountModal(false);
          void refresh();
        }}
      />
    </>
  );
}
