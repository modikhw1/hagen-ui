import { useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';

export default function MobileEntryPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  
  useEffect(() => {
    const params = new URLSearchParams(search);
    const isLegacyDemo = params.get('demo') === 'true' || params.get('auth') === 'true';

    if (isLegacyDemo) {
      const next = new URLSearchParams();
      if (params.get('auth') === 'true') {
        next.set('auth', 'true');
      }
      const suffix = next.size > 0 ? `?${next.toString()}` : '';
      navigate(`/m/legacy-demo${suffix}`);
    } else {
      navigate('/m/feed');
    }
  }, [navigate, search]);

  return (
    <div style={{ minHeight: '100vh', background: '#FAF8F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#7D6E5D', fontSize: 15 }}>Laddar...</div>
    </div>
  );
}
