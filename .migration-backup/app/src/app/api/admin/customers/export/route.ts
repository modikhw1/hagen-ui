import { formatDateOnly } from '@/lib/admin/billing-periods';
import { withAdmin } from '@/lib/admin/with-admin';
import { customerListParamsInputSchema } from '@/lib/admin/customers/list.schemas';
import { loadAdminCustomers } from '@/lib/admin/customers/list.server';

function escapeCsv(value: string | number | null | undefined) {
  if (value == null) return '';
  const normalized = String(value).replace(/"/g, '""');
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

function onboardingLabel(state: string) {
  if (state === 'cm_ready') return 'CM-redo';
  if (state === 'live') return 'Live';
  if (state === 'settled') return 'Stabil';
  return 'Inviterad';
}

const customerExportQuerySchema = customerListParamsInputSchema;

export const GET = withAdmin(
  async ({ input }) => {
    const data = await loadAdminCustomers({ ...input, page: 1, pageSize: 10_000 });

    const header = [
      'Företag',
      'E-post',
      'Kontaktperson',
      'Status',
      'Onboarding',
      'CM',
      'Prisstatus',
      'MRR_SEK',
      'Tillagd',
    ];

    const csv = [
      header.join(','),
      ...data.rows.map((row) =>
        [
          row.business_name,
          row.contact_email,
          row.customer_contact_name,
          row.status,
          onboardingLabel(row.onboardingState),
          row.account_manager,
          row.pricing_status,
          row.pricing_status === 'unknown' ? '' : Math.max(0, Number(row.monthly_price) || 0),
          row.created_at,
        ]
          .map(escapeCsv)
          .join(','),
      ),
    ].join('\n');

    return new Response(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=\"customers-${formatDateOnly(new Date())}.csv\"`,
      },
    });
  },
  {
    input: customerExportQuerySchema,
    route: '/api/admin/customers/export',
  },
);
