'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

interface UploadResult {
  message: string;
  gcsUri?: string;
}

export default function StudioUploadPage() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [progress, setProgress] = useState('');

  const handleUpload = async () => {
    if (!videoUrl) return;
    
    setUploading(true);
    setAnalyzing(true);
    setResult(null);
    setProgress('Laddar upp video till hagen-main...');

    try {
      const hagenApiUrl = process.env.NEXT_PUBLIC_HAGEN_API_URL;
      if (!hagenApiUrl) {
        throw new Error('Video-tjänsten är inte tillgänglig ännu. Kontakta admin.');
      }

      // Step 1: Upload video
      const uploadRes = await fetch(`${hagenApiUrl}/api/videos/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl }),
      });
      
      const uploadData = await uploadRes.json();
      
      if (!uploadRes.ok) {
        throw new Error(uploadData.error || 'Upload failed');
      }

      setProgress('Video uppladdad. Startar analys...');

      // Step 2: Analyze video (using hagen-main API)
      const analyzeRes = await fetch(`${hagenApiUrl}/api/videos/analyze/main`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          videoUrl,
          platform: 'tiktok'
        }),
      });
      
      const analyzeData = await analyzeRes.json();
      
      if (!analyzeRes.ok) {
        throw new Error(analyzeData.error || 'Analysis failed');
      }

      setProgress('Analys klar! Sparar concept till databasen...');

      // Step 3: Save concept to database via /api/admin/concepts
      // Extract a readable headline from the analysis result
      const headline =
        analyzeData?.headline ||
        analyzeData?.title ||
        analyzeData?.humor_analysis?.mechanism ||
        'Nytt TikTok-koncept';

      // Build a unique concept ID from the video URL
      const urlSegments = videoUrl.split('/').filter(Boolean);
      const videoIdSegment = urlSegments[urlSegments.length - 1]?.replace(/[^0-9]/g, '') || Date.now().toString();
      const conceptId = `clip-${videoIdSegment}`;

      const { data: { session } } = await supabase.auth.getSession();
      const saveRes = await fetch('/api/admin/concepts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          id: conceptId,
          backend_data: {
            ...analyzeData,
            url: videoUrl,
            source_url: videoUrl,
            gcs_uri: uploadData.gcsUri,
            platform: 'tiktok',
          },
          overrides: {
            headline_sv: headline,
          },
        }),
      });

      const saveData = await saveRes.json();

      if (!saveRes.ok) {
        setResult({
          message: `Video analyserad, men sparning misslyckades: ${saveData.error}`,
          gcsUri: uploadData.gcsUri,
        });
        return;
      }

      const savedConceptId = saveData.concept?.id || conceptId;
      setProgress('Concept sparat! Vidarebefordrar till granskning...');
      router.push(`/studio/concepts/${savedConceptId}/review`);

    } catch (err: any) {
      setResult({
        message: err.message || 'Något gick fel',
      });
    } finally {
      setUploading(false);
      setAnalyzing(false);
      setProgress('');
    }
  };

  return (
    <div style={{ maxWidth: '800px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px', color: '#1a1a2e' }}>
        Ladda upp video
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '24px' }}>
        Ladda upp en TikTok-video för att skapa ett nytt concept. Videon analyseras av hagen-main och kan sedan redigeras.
      </p>

      {/* URL Input */}
      <div style={{ 
        background: '#fff', 
        borderRadius: '12px', 
        padding: '24px', 
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
          TikTok URL
        </label>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="url"
            placeholder="https://www.tiktok.com/@user/video/123456789"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            disabled={uploading}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          />
          <button
            onClick={handleUpload}
            disabled={!videoUrl || uploading}
            style={{
              background: !videoUrl || uploading ? '#9ca3af' : '#4f46e5',
              color: '#fff',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 500,
              cursor: !videoUrl || uploading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {uploading ? 'Laddar upp...' : 'Ladda upp & analysera'}
          </button>
        </div>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
          Exempel: https://www.tiktok.com/@aveny.cafe/video/7575529523970690326
        </p>
      </div>

      {/* Progress */}
      {progress && (
        <div style={{ 
          background: '#eff6ff', 
          borderRadius: '12px', 
          padding: '16px', 
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ 
            width: '20px', 
            height: '20px', 
            border: '2px solid #3b82f6', 
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <span style={{ color: '#1d4ed8', fontSize: '14px' }}>{progress}</span>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Result — only shown on failure (success redirects to review) */}
      {result && (
        <div style={{
          background: '#fef2f2',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>❌</span>
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#991b1b' }}>
              {result.message}
            </span>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div style={{ 
        background: '#f8fafc', 
        borderRadius: '12px', 
        padding: '20px',
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
          Hur det funkar
        </h3>
        <ol style={{ margin: 0, paddingLeft: '20px', color: '#475569', fontSize: '14px', lineHeight: 1.8 }}>
          <li>Klistra in en TikTok-länk ovan</li>
          <li>Klicka på "Ladda upp & analysera"</li>
          <li>hagen-main laddar ner videon och analyserar innehållet</li>
          <li>Du skickas direkt till granskning för att namnge och klassificera konceptet</li>
          <li>Publicera konceptet när det är klart — det syns då i biblioteket</li>
          <li>Tilldela konceptet till en kund från biblioteket</li>
        </ol>
      </div>
    </div>
  );
}
