import { notFound } from 'next/navigation';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { DemoLandingView } from './DemoLandingView';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params;
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('demos')
    .select('company_name')
    .eq('share_token', token)
    .maybeSingle();
  const name = data?.company_name ?? 'Demo';
  return {
    title: `${name} · LeTrend demo`,
    description: `Förslag på en kurerad innehållsplan för ${name}.`,
  };
}

export default async function DemoLandingPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = createSupabaseAdmin();

  const { data: demo } = await supabase
    .from('demos')
    .select(
      'id, company_name, contact_name, tiktok_handle, tiktok_profile_pic_url, proposed_concepts_per_week, preliminary_feedplan, status',
    )
    .eq('share_token', token)
    .maybeSingle();

  if (!demo) {
    notFound();
  }

  return <DemoLandingView demo={demo} />;
}