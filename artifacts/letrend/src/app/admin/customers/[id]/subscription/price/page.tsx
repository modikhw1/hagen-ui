// @ts-nocheck
import { redirect } from '@/lib/navigation-compat';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/customers/${id}/avtal`);
}
