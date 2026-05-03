import { useEffect, useState } from 'react';
import { useParams } from '@/lib/navigation-compat';
import { DemoLandingView } from './DemoLandingView';
import { supabase } from '@/lib/supabase/client';

type DemoData = {
  id: string;
  company_name: string;
  contact_name: string | null;
  tiktok_handle: string | null;
  tiktok_profile_pic_url: string | null;
  proposed_concepts_per_week: number | null;
  preliminary_feedplan: unknown;
  status: string;
};

export default function DemoLandingPage() {
  const { token } = useParams() as { token: string };
  const [demo, setDemo] = useState<DemoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    supabase
      .from('demos')
      .select(
        'id, company_name, contact_name, tiktok_handle, tiktok_profile_pic_url, proposed_concepts_per_week, preliminary_feedplan, status',
      )
      .eq('share_token', token)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFound(true);
        } else {
          setDemo(data as DemoData);
        }
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5]">
        <div className="w-8 h-8 border-2 border-[#6B4423] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !demo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5]">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-[#1A1612] mb-2">Demo hittades inte</h1>
          <p className="text-[#5D4D3D]">Den här länken är inte längre giltig.</p>
        </div>
      </div>
    );
  }

  return <DemoLandingView demo={demo} />;
}
