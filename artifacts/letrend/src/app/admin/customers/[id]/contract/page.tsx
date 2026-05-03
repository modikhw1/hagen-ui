// @ts-nocheck
import { permanentRedirect } from '@/lib/navigation-compat';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/admin/customers/${id}/avtal`);
}
