// @ts-nocheck
'use client';

import { useEffect } from 'react';
import { Center, Loader } from '@mantine/core';
import { useParams, useSearchParams, useRouter } from '@/lib/navigation-compat';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerDrift } from '@/hooks/admin/useCustomerDrift';
import { CustomerDriftRoute } from '@/components/admin/customers/routes/CustomerDriftRoute';

function getValue(value: string | null | undefined) {
  return value ?? undefined;
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const router = useRouter();

  const focus = getValue(searchParams.get('focus'));
  const invoice = getValue(searchParams.get('invoice'));

  const { data: customer, isLoading: customerLoading } = useCustomerDetail(id ?? '');
  const { data: drift, isLoading: driftLoading } = useCustomerDrift(id ?? '');

  useEffect(() => {
    if (!id) return;
    if (invoice) {
      router.push(`/admin/customers/${id}/avtal/${invoice}`);
      return;
    }
    const focusMap: Record<string, string> = {
      contract: `/admin/customers/${id}/avtal`,
      invoices: `/admin/customers/${id}/avtal`,
      'upcoming-invoice': `/admin/customers/${id}/avtal`,
      pending: `/admin/customers/${id}/avtal`,
      operations: `/admin/customers/${id}`,
      cm: `/admin/customers/${id}#cm`,
      activity: `/admin/customers/${id}`,
      contact: `/admin/customers/${id}/avtal`,
      'tiktok-profile': `/admin/customers/${id}/avtal`,
      studio: `/admin/customers/${id}`,
      subscription: `/admin/customers/${id}/avtal`,
    };
    if (focus && focus in focusMap) {
      router.push(focusMap[focus]);
    }
  }, [id, focus, invoice]);

  if (customerLoading) {
    return (
      <Center h={400}>
        <Loader size="md" />
      </Center>
    );
  }

  const overview = drift?.overview ?? {
    business_name: customer?.business_name ?? '',
    status: customer?.status ?? 'active',
    derived_status: customer?.derived_status ?? null,
    invited_at: customer?.invited_at ?? null,
    paused_until: customer?.paused_until ?? null,
    monthly_price_ore: (customer?.monthly_price ?? 0) * 100,
    account_manager_id: customer?.account_manager_profile_id ?? null,
    account_manager_member_id: null,
    account_manager_name: customer?.account_manager ?? null,
    account_manager_avatar_url: customer?.cm_avatar_url ?? null,
    account_manager_email: null,
    account_manager_city: null,
    account_manager_commission_rate: null,
    account_manager_since: null,
    scheduled_cm_change: null,
    next_invoice_estimate_ore: 0,
    next_invoice_date: customer?.next_invoice_date ?? null,
    last_activity_at: null,
    last_activity_summary: null,
    stripe_customer_id: customer?.stripe_customer_id ?? null,
    tiktok_handle: customer?.tiktok_handle ?? null,
    tiktok_profile_pic_url: null,
  };

  const pulse = drift?.pulse ?? {
    last_cm_action_at: null,
    last_cm_action_type: null,
    last_cm_action_by: null,
    planned_concepts_this_week: 0,
    expected_concepts_per_week: customer?.expected_concepts_per_week ?? 0,
    delivered_concepts_this_week: 0,
    recent_publications: [],
    tiktok_stats: null,
    upload_schedule: customer?.upload_schedule ?? null,
  };

  return (
    <CustomerDriftRoute
      customerId={id ?? ''}
      overview={overview}
      pulse={pulse}
    />
  );
}
