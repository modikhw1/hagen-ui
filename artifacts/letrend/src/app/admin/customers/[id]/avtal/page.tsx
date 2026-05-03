// @ts-nocheck
'use client';

import { useMemo } from 'react';
import { Center, Loader } from '@mantine/core';
import { useParams, useSearchParams } from '@/lib/navigation-compat';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerInvoices } from '@/hooks/admin/useCustomerInvoices';
import { CustomerAvtalRoute } from '@/components/admin/customers/routes/CustomerAvtalRoute';

export default function CustomerAvtalPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();

  const invoiceId = searchParams.get('invoice') ?? undefined;
  const manualInvoice = searchParams.get('manualInvoice');

  const { data: customer, isLoading: customerLoading } = useCustomerDetail(id ?? '');
  const { data: invoicesData, isLoading: invoicesLoading } = useCustomerInvoices(id ?? '');

  const isLoading = customerLoading;

  if (isLoading || !customer) {
    return (
      <Center h={400}>
        <Loader size="md" />
      </Center>
    );
  }

  const isSuperAdmin =
    profile?.is_admin === true
    || profile?.role === 'admin'
    || profile?.role === 'super_admin'
    || profile?.role === 'superadmin'
    || profile?.role === 'operations_admin';

  const organisation = useMemo(
    () => ({
      business_name: customer.business_name,
      contact_email: customer.contact_email,
      customer_contact_name: customer.customer_contact_name ?? null,
      phone: customer.phone ?? null,
      first_invoice_behavior: 'prorated' as const,
      logo_url: null,
      status: customer.status ?? null,
      tiktok_handle: customer.tiktok_handle ?? null,
      tiktok_profile_pic_url: customer.tiktok_profile_url ?? null,
    }),
    [
      customer.business_name,
      customer.contact_email,
      customer.customer_contact_name,
      customer.phone,
      customer.status,
      customer.tiktok_handle,
      customer.tiktok_profile_url,
    ],
  );

  const billingInvoices = useMemo(
    () =>
      (invoicesData?.invoices ?? []).map((inv) => ({
        stripe_invoice_id: inv.stripe_invoice_id ?? inv.id,
        number: null,
        status: inv.status,
        amount_due: inv.amount_due ?? 0,
        amount_paid: 0,
        display_amount_ore: inv.total_ore ?? inv.amount_due ?? 0,
        currency: inv.currency ?? 'sek',
        created_at: inv.created_at,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        has_incomplete_operation: false,
      })),
    [invoicesData?.invoices],
  );

  const billingInitialData = useMemo(
    () => ({
      monthly_price_ore: (customer.monthly_price ?? 0) * 100,
      pricing_status: customer.pricing_status ?? 'fixed',
      subscription_status: customer.subscription_status ?? null,
      stripe_customer_id: customer.stripe_customer_id ?? null,
      stripe_subscription_id: customer.stripe_subscription_id ?? null,
      next_invoice_date: customer.next_invoice_date ?? null,
      upcoming_price_change: customer.upcoming_price_change ?? null,
      invoices: billingInvoices,
      environment_warning: null,
      discount:
        customer.discount_type && customer.discount_type !== 'none'
          ? {
              type: customer.discount_type,
              value: customer.discount_value ?? 0,
              ends_at: customer.discount_ends_at ?? null,
            }
          : null,
    }),
    [
      customer.monthly_price,
      customer.pricing_status,
      customer.subscription_status,
      customer.stripe_customer_id,
      customer.stripe_subscription_id,
      customer.next_invoice_date,
      customer.upcoming_price_change,
      customer.discount_type,
      customer.discount_value,
      customer.discount_ends_at,
      billingInvoices,
    ],
  );

  const billing = useMemo(
    () => ({
      customerId: id ?? '',
      customerName: customer.business_name,
      initialData: billingInitialData,
      initialInvoiceId: invoiceId,
      initialStandaloneOpen: manualInvoice === '1',
      permissions: {
        canManageBilling: isSuperAdmin,
      },
    }),
    [
      id,
      customer.business_name,
      billingInitialData,
      invoiceId,
      manualInvoice,
      isSuperAdmin,
    ],
  );

  const ops = useMemo(
    () => ({
      stripe_customer_id: customer.stripe_customer_id ?? null,
      stripe_subscription_id: customer.stripe_subscription_id ?? null,
      tiktok_handle: customer.tiktok_handle ?? null,
      environment_warning: null,
    }),
    [
      customer.stripe_customer_id,
      customer.stripe_subscription_id,
      customer.tiktok_handle,
    ],
  );

  return (
    <CustomerAvtalRoute
      customerId={id ?? ''}
      organisation={organisation}
      billing={billing}
      ops={ops}
    />
  );
}
