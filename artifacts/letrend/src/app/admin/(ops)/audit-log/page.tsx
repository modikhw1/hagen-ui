import { AuditLogScreen } from '@/components/admin/audit/AuditLogScreen';
import { useSearchParams } from '@/lib/navigation-compat';

export default function AuditLogPage() {
  const [searchParams] = useSearchParams();
  const onlyErrors = searchParams.get('onlyErrors') === '1' || searchParams.get('onlyErrors') === 'true';
  const billingOnly = searchParams.get('billingOnly') === '1' || searchParams.get('billingOnly') === 'true';

  return (
    <AuditLogScreen
      actor={searchParams.get('actor') ?? undefined}
      action={searchParams.get('action') ?? undefined}
      entity={searchParams.get('entity') ?? undefined}
      from={searchParams.get('from') ?? undefined}
      to={searchParams.get('to') ?? undefined}
      onlyErrors={onlyErrors}
      billingOnly={billingOnly}
    />
  );
}
