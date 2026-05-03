import { redirect } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/customers/${id}/avtal?manualInvoice=1`);
}
