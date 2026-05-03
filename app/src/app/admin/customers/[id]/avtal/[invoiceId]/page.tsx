import { redirect } from 'next/navigation';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const { id, invoiceId } = await params;
  redirect(`/admin/customers/${id}/avtal?invoice=${invoiceId}`);
}
