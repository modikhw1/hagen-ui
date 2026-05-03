import { useParams } from 'wouter';
import { DemoLandingView } from './DemoLandingView';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export default function DemoLandingPage() {
  const { token } = useParams<{ token: string }>();
  const { data: demo, isLoading } = useQuery({
    queryKey: ['demo', token],
    enabled: !!token,
    queryFn: async () => {
      const { data } = await supabase.from('demos')
        .select('id, company_name, contact_name, tiktok_handle, tiktok_profile_pic_url, proposed_concepts_per_week, preliminary_feedplan, status')
        .eq('share_token', token!)
        .maybeSingle();
      return data;
    },
  });
  if (isLoading) return <div style={{ padding: 40 }}>Laddar...</div>;
  if (!demo) return <div style={{ padding: 40 }}>Demo hittades inte.</div>;
  return <DemoLandingView demo={demo} />;
}
