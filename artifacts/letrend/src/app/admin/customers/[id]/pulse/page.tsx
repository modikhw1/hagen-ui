// @ts-nocheck
import { redirect } from '@/lib/navigation-compat';

export default async function CustomerPulsePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/customers/${id}`);
}
