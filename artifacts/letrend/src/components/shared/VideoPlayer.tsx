'use client';

import { useVideoSignedUrl } from '@/hooks/useVideoSignedUrl';

export function VideoPlayer({
  videoUrl,
  gcsUri,
  showLabel = true
}: {
  videoUrl?: string;
  gcsUri?: string;
  showLabel?: boolean;
}) {
  const { signedUrl, isLoading: loading, error } = useVideoSignedUrl({
    gcsUri,
    enabled: true
  });

  if (signedUrl) {
    return (
      <div
        className="video-container"
        style={{
          width: '100%',
          aspectRatio: '9/16',
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          background: '#1A1612'
        }}>
        <video
          src={signedUrl}
          controls
          playsInline
          preload="metadata"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain'
          }}
        />
        {showLabel && (
          <div style={{
            position: 'absolute',
            bottom: '14px',
            left: '14px',
            background: 'rgba(0,0,0,0.6)',
            color: '#FFF',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            zIndex: 10
          }}>
            Original referens
          </div>
        )}
      </div>
    );
  }

  if (loading && gcsUri) {
    return (
      <div
        className="video-container"
        style={{
          width: '100%',
          aspectRatio: '9/16',
          background: 'linear-gradient(145deg, #5D4D3D, #4A3F33)',
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden'
        }}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#FAF8F5',
          fontSize: '14px',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '8px' }}>⏳</div>
          Laddar video...
        </div>
      </div>
    );
  }

  const getTikTokEmbedUrl = (url: string) => {
    const match = url.match(/video\/(\d+)/);
    if (match) {
      return `https://www.tiktok.com/embed/v2/${match[1]}`;
    }
    return null;
  };

  const embedUrl = videoUrl ? getTikTokEmbedUrl(videoUrl) : null;

  if (embedUrl) {
    return (
      <div
        className="video-container"
        style={{
          width: '100%',
          aspectRatio: '9/16',
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          background: '#1A1612'
        }}>
        <iframe
          src={embedUrl}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none'
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {showLabel && (
          <div style={{
            position: 'absolute',
            bottom: '14px',
            left: '14px',
            background: 'rgba(0,0,0,0.6)',
            color: '#FFF',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            zIndex: 10
          }}>
            Original referens
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="video-container"
      style={{
        width: '100%',
        aspectRatio: '9/16',
        background: 'linear-gradient(145deg, #5D4D3D, #4A3F33)',
        position: 'relative',
        borderRadius: '16px',
        overflow: 'hidden'
      }}>
      {error ? (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#FAF8F5',
          fontSize: '12px',
          textAlign: 'center',
          padding: '0 20px'
        }}>
          {error}
        </div>
      ) : videoUrl ? (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'rgba(250,248,245,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FAF8F5',
            fontSize: '28px',
            cursor: 'pointer',
            textDecoration: 'none'
          }}
        >
          ▶
        </a>
      ) : (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'rgba(250,248,245,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FAF8F5',
          fontSize: '28px'
        }}>
          ▶
        </div>
      )}
      {showLabel && (
        <div style={{
          position: 'absolute',
          bottom: '14px',
          left: '14px',
          background: 'rgba(0,0,0,0.6)',
          color: '#FFF',
          padding: '6px 12px',
          borderRadius: '8px',
          fontSize: '12px'
        }}>
          {error ? 'Video ej tillgänglig' : videoUrl ? 'Öppna på TikTok' : 'Video ej tillgänglig'}
        </div>
      )}
    </div>
  );
}
