import { permanentRedirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/admin/customers/${id}/operations#cm`);
}
