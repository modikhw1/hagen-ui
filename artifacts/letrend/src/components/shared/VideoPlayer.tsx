'use client';

import { useState } from 'react';
import { useVideoSignedUrl } from '@/hooks/useVideoSignedUrl';

/**
 * Embed-first video player.
 *
 * Primary source: TikTok / YouTube / Instagram embed iframe (when `videoUrl`
 * is one of those platforms).
 * Fallback: GCS-backed signed URL `<video>` element (when embed fails to
 * load or `videoUrl` is not embeddable).
 *
 * GCS download is kept for safety and future use but is no longer the
 * default render path. See Task #15 Step 8.
 */
export function VideoPlayer({
  videoUrl,
  gcsUri,
  showLabel = true,
}: {
  videoUrl?: string;
  gcsUri?: string;
  showLabel?: boolean;
}) {
  const [embedFailed, setEmbedFailed] = useState(false);

  const embedUrl = videoUrl ? getEmbedUrl(videoUrl) : null;
  const useEmbed = Boolean(embedUrl) && !embedFailed;

  const { signedUrl, isLoading: gcsLoading, error: gcsError } = useVideoSignedUrl({
    gcsUri,
    enabled: !useEmbed,
  });

  if (useEmbed && embedUrl) {
    return (
      <Container>
        <iframe
          src={embedUrl}
          onError={() => setEmbedFailed(true)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {showLabel ? <Label>Original referens</Label> : null}
      </Container>
    );
  }

  if (signedUrl) {
    return (
      <Container>
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
            objectFit: 'contain',
          }}
        />
        {showLabel ? <Label>Original referens (GCS-fallback)</Label> : null}
      </Container>
    );
  }

  if (gcsLoading && gcsUri) {
    return (
      <Container background="linear-gradient(145deg, #5D4D3D, #4A3F33)">
        <Center>
          <div style={{ marginBottom: 8 }}>⏳</div>
          Laddar video...
        </Center>
      </Container>
    );
  }

  return (
    <Container background="linear-gradient(145deg, #5D4D3D, #4A3F33)">
      {gcsError ? (
        <Center style={{ padding: '0 20px', fontSize: 12 }}>{gcsError}</Center>
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
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'rgba(250,248,245,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FAF8F5',
            fontSize: 28,
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          ▶
        </a>
      ) : (
        <Center>▶</Center>
      )}
      {showLabel ? (
        <Label>{gcsError ? 'Video ej tillgänglig' : videoUrl ? 'Öppna på TikTok' : 'Video ej tillgänglig'}</Label>
      ) : null}
    </Container>
  );
}

function getEmbedUrl(url: string): string | null {
  const tiktok = url.match(/tiktok\.com\/.*\/video\/(\d+)/);
  if (tiktok) return `https://www.tiktok.com/embed/v2/${tiktok[1]}`;

  const youtube = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;

  const instagram = url.match(/instagram\.com\/(?:p|reel)\/([\w-]+)/);
  if (instagram) return `https://www.instagram.com/p/${instagram[1]}/embed`;

  return null;
}

function Container({
  children,
  background = '#1A1612',
}: {
  children: React.ReactNode;
  background?: string;
}) {
  return (
    <div
      className="video-container"
      style={{
        width: '100%',
        aspectRatio: '9/16',
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        background,
      }}
    >
      {children}
    </div>
  );
}

function Center({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: '#FAF8F5',
        fontSize: 14,
        textAlign: 'center',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 14,
        left: 14,
        background: 'rgba(0,0,0,0.6)',
        color: '#FFF',
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 12,
        zIndex: 10,
      }}
    >
      {children}
    </div>
  );
}
