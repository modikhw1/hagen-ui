import { AuditLogScreen } from '@/components/admin/audit/AuditLogScreen';
import { useSearchParams } from '@/lib/navigation-compat';

export default function AuditLogPage() {
  const [searchParams] = useSearchParams();

  const actor = searchParams?.get('actor') ?? undefined;
  const action = searchParams?.get('action') ?? undefined;
  const entity = searchParams?.get('entity') ?? undefined;
  const from = searchParams?.get('from') ?? undefined;
  const to = searchParams?.get('to') ?? undefined;
  const onlyErrors =
    searchParams?.get('onlyErrors') === '1' || searchParams?.get('onlyErrors') === 'true';
  const billingOnly =
    searchParams?.get('billingOnly') === '1' || searchParams?.get('billingOnly') === 'true';

  return (
    <AuditLogScreen
      actor={actor}
      action={action}
      entity={entity}
      from={from}
      to={to}
      onlyErrors={onlyErrors}
      billingOnly={billingOnly}
    />
  );
}
