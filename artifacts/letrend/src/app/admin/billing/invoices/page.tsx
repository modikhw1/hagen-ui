// @ts-nocheck
import { permanentRedirect } from '@/lib/navigation-compat';

export default function Page() {
  permanentRedirect('/admin/billing?view=invoices');
}
