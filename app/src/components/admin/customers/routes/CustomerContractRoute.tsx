'use client';

import { useState } from 'react';
import EmptyValue from '@/components/admin/_shared/EmptyValue';
import ContactEditForm from '@/components/admin/customers/ContactEditForm';
import ContractEditForm from '@/components/admin/customers/ContractEditForm';
import DiscountModal from '@/components/admin/customers/modals/DiscountModal';
import { useCustomerBillingRefresh } from '@/hooks/admin/useAdminRefresh';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useEditSection } from '@/hooks/admin/useEditSection';
import { intervalLong } from '@/lib/admin/labels';
import { formatPriceSEK } from '@/lib/admin/money';
import { longDateSv, shortDateSv } from '@/lib/admin/time';
import {
  CustomerActionButton,
  CustomerField,
  CustomerRouteError,
  CustomerRouteLoading,
  CustomerSection,
} from './shared';

function formatDiscountValue(customer: NonNullable<ReturnType<typeof useCustomerDetail>['data']>) {
  if (!customer.discount_type || customer.discount_type === 'none') {
    return null;
  }

  if (customer.discount_type === 'percent') {
    return `${customer.discount_value || 0}%`;
  }

  if (customer.discount_type === 'amount') {
    return `${customer.discount_value || 0} kr`;
  }

  return `${customer.discount_value || 0} gratis månader`;
}

function formatDiscountPeriod(customer: NonNullable<ReturnType<typeof useCustomerDetail>['data']>) {
  if (!customer.discount_type || customer.discount_type === 'none') {
    return null;
  }

  if (customer.discount_ends_at) {
    return `Till och med ${longDateSv(customer.discount_ends_at)}`;
  }

  if (customer.discount_type === 'free_months') {
    return `${customer.discount_value || 0} månader`;
  }

  if (customer.discount_duration_months) {
    return `${customer.discount_duration_months} månader`;
  }

  return 'Tillsvidare';
}

export default function CustomerContractRoute({ customerId }: { customerId: string }) {
  const { data: customer, isLoading, error } = useCustomerDetail(customerId);
  const refresh = useCustomerBillingRefresh(customerId);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const editSection = useEditSection<'pricing' | 'contact'>();

  if (isLoading) {
    return <CustomerRouteLoading label="Laddar avtal..." />;
  }

  if (error || !customer) {
    return <CustomerRouteError message={error?.message || 'Kunden hittades inte.'} />;
  }

  const discountValue = formatDiscountValue(customer);
  const discountPeriod = formatDiscountPeriod(customer);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <CustomerSection
          title="Avtal och prissättning"
          action={
            <button
              type="button"
              onClick={() => editSection.toggle('pricing')}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {editSection.isActive('pricing') ? 'Avbryt' : 'Redigera'}
            </button>
          }
        >
          {editSection.isActive('pricing') ? (
            <ContractEditForm
              customer={customer}
              onSaved={() => {
                editSection.close();
                void refresh();
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CustomerField
                label="Månadspris"
                value={formatPriceSEK(customer.monthly_price, { fallback: 'Ej satt' })}
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
                value={customer.billing_day_of_month ?? <EmptyValue />}
              />
              <CustomerField
                label="Nästa faktura"
                value={shortDateSv(customer.next_invoice_date)}
              />
              <CustomerField
                label="Kund sedan"
                value={shortDateSv(customer.created_at)}
              />
              {customer.upcoming_price_change ? (
                <CustomerField
                  label="Schemalagd prisändring"
                  value={`${formatPriceSEK(customer.upcoming_price_change.price_ore, {
                    fallback: 'Ej satt',
                    unit: 'ore',
                  })} från ${shortDateSv(customer.upcoming_price_change.effective_date)}`}
                />
              ) : null}
              {discountValue ? (
                <CustomerField
                  label="Rabatt"
                  value={discountValue}
                />
              ) : null}
              {discountPeriod ? (
                <CustomerField
                  label="Rabattperiod"
                  value={discountPeriod}
                />
              ) : null}
            </div>
          )}
        </CustomerSection>

        <CustomerSection title="Avtalsåtgärder">
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
            type="button"
            onClick={() => editSection.toggle('contact')}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {editSection.isActive('contact') ? 'Avbryt' : 'Redigera'}
          </button>
        }
      >
        {editSection.isActive('contact') ? (
          <ContactEditForm
            customer={customer}
            onSaved={() => {
              editSection.close();
              void refresh();
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CustomerField label="Företag" value={customer.business_name} />
            <CustomerField label="E-post" value={customer.contact_email} />
            <CustomerField
              label="Kontaktperson"
              value={customer.customer_contact_name || <EmptyValue />}
            />
            <CustomerField label="Telefon" value={customer.phone || <EmptyValue />} />
          </div>
        )}
      </CustomerSection>

      <DiscountModal
        open={showDiscountModal}
        customerId={customerId}
        customer={customer}
        onClose={() => setShowDiscountModal(false)}
      />
    </>
  );
}
