// components/admin/customers/routes/CustomerDetailHeader.server.tsx
import { ExternalLink, Sparkles } from 'lucide-react';
import { customerStatusConfig } from '@/lib/admin/labels';
import { loadAdminCustomerHeader } from '@/lib/admin/customer-detail/load';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { studioUrlForCustomer } from '@/lib/studio/urls';
import CustomerBackButton from './CustomerBackButton';
import CustomerHeaderAttention from './CustomerHeaderAttention';

export default async function CustomerDetailHeader({ customerId }: { customerId: string }) {
  const customer = await loadAdminCustomerHeader(customerId);
  const statusCfg = customerStatusConfig(customer.status);
  const studioHref = studioUrlForCustomer(customer);

  return (
    <>
      <CustomerBackButton />

      {/* Rad 1 — identitet */}
      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate font-heading text-2xl font-bold text-foreground">
              {customer.business_name || 'Kunddetalj'}
            </h1>
            <StatusPill label={statusCfg.label} tone={statusCfg.tone} />
            {studioHref ? (
              <a
                href={studioHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Sparkles className="h-3 w-3 text-primary" />
                Öppna Studio
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {customer.contact_email || 'Inga kontaktuppgifter ännu'}
            {customer.customer_contact_name ? ` · ${customer.customer_contact_name}` : ''}
            {customer.tiktok_handle ? (
              <>
                {' · '}
                <a
                  href={`https://www.tiktok.com/@${customer.tiktok_handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >@{customer.tiktok_handle}</a>
              </>
            ) : ''}
          </p>
        </div>

        {/* Höger: enbart **högst** prioriterade attention. Inget om allt är ok. */}
        <CustomerHeaderAttention customerId={customerId} />
      </div>

      {/* Rad 2 — fakta-strip */}
      <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-xs">
        <Fact label="MRR"           value={customer.monthly_price ? formatSek(customer.monthly_price) : '—'} />
        <Fact label="CM"            value={customer.account_manager_name ?? 'Ingen'} />
        <Fact label="Nästa faktura" value={customer.next_invoice_date ? shortDateSv(customer.next_invoice_date) : '—'} />
        <Fact label="Kund sedan"    value={customer.created_at ? shortDateSv(customer.created_at) : '—'} />
      </dl>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
