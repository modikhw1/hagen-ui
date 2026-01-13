'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

interface VideoPlayerProps {
  gcsUri?: string
  videoUrl?: string  // TikTok URL fallback
  variant?: 'desktop' | 'mobile'
  showControls?: boolean
  showLabel?: boolean
  labelText?: string
  autoPlay?: boolean
  className?: string
}

/**
 * Universal VideoPlayer component
 *
 * Priority order:
 * 1. GCS signed URL (native video)
 * 2. TikTok embed (if videoUrl is TikTok)
 * 3. Direct videoUrl (if not TikTok)
 *
 * Features:
 * - Responsive variants (desktop/mobile)
 * - Custom play/pause overlay when controls hidden
 * - Optional label overlay
 * - TikTok embed fallback
 */
export function VideoPlayer({
  gcsUri,
  videoUrl,
  variant = 'desktop',
  showControls = true,
  showLabel = false,
  labelText = 'Original referens',
  autoPlay = false,
  className = ''
}: VideoPlayerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(autoPlay)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Fetch signed URL from API if GCS URI is provided
  useEffect(() => {
    if (gcsUri && !signedUrl && !isLoading) {
      setIsLoading(true)
      setError(null)

      const videoId = gcsUri.split('/').pop()?.replace('.mp4', '') || 'video'
      fetch(`/api/video/${videoId}?gcs_uri=${encodeURIComponent(gcsUri)}`)
        .then(res => res.json())
        .then(data => {
          if (data.signedUrl) {
            setSignedUrl(data.signedUrl)
          } else if (data.error) {
            setError(data.error)
          }
        })
        .catch(err => {
          console.error('Video signing failed:', err)
          setError('Kunde inte ladda video')
        })
        .finally(() => setIsLoading(false))
    }
  }, [gcsUri, signedUrl, isLoading])

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }, [isPlaying])

  // Reset playing state when video ends
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      const handleEnded = () => setIsPlaying(false)
      const handlePlay = () => setIsPlaying(true)
      const handlePause = () => setIsPlaying(false)

      video.addEventListener('ended', handleEnded)
      video.addEventListener('play', handlePlay)
      video.addEventListener('pause', handlePause)

      return () => {
        video.removeEventListener('ended', handleEnded)
        video.removeEventListener('play', handlePlay)
        video.removeEventListener('pause', handlePause)
      }
    }
  }, [])

  // Extract TikTok video ID for embed
  const getTikTokEmbedUrl = (url: string): string | null => {
    const match = url.match(/video\/(\d+)/)
    return match ? `https://www.tiktok.com/embed/v2/${match[1]}` : null
  }

  // Responsive styles based on variant
  const maxWidth = variant === 'mobile' ? 280 : 300
  const containerStyles: React.CSSProperties = {
    width: '100%',
    maxWidth: `${maxWidth}px`,
    margin: '0 auto',
    position: 'relative',
    aspectRatio: '9/16',
    borderRadius: variant === 'mobile' ? 16 : 14,
    overflow: 'hidden',
    background: '#1A1612',
  }

  // Label overlay component
  const LabelOverlay = () => showLabel ? (
    <div style={{
      position: 'absolute',
      bottom: '14px',
      left: '14px',
      background: 'rgba(0,0,0,0.6)',
      color: '#FFF',
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: '12px',
      zIndex: 10,
      fontFamily: '"DM Sans", sans-serif'
    }}>
      {labelText}
    </div>
  ) : null

  // Play button overlay component
  const PlayButtonOverlay = () => (!showControls && !isPlaying) ? (
    <button
      onClick={handlePlayPause}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 60,
        height: 60,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.9)',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        color: '#4A2F18',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)'}
    >
      ▶
    </button>
  ) : null

  // Loading state
  if (isLoading) {
    return (
      <div style={containerStyles} className={className}>
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9D8E7D',
          fontSize: 14,
          fontFamily: '"DM Sans", sans-serif'
        }}>
          <div style={{ marginBottom: '8px' }}>⏳</div>
          Laddar video...
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div style={containerStyles} className={className}>
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9D8E7D',
          fontSize: 14,
          padding: 20,
          textAlign: 'center',
          fontFamily: '"DM Sans", sans-serif'
        }}>
          <span style={{ fontSize: 32, marginBottom: 8 }}>⚠️</span>
          <span>{error}</span>
        </div>
      </div>
    )
  }

  // Priority 1: GCS signed URL - native video
  if (signedUrl) {
    return (
      <div style={containerStyles} className={className}>
        <video
          ref={videoRef}
          src={signedUrl}
          controls={showControls}
          autoPlay={autoPlay}
          playsInline
          loop
          preload="metadata"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
          onClick={showControls ? undefined : handlePlayPause}
        />
        <LabelOverlay />
        <PlayButtonOverlay />
      </div>
    )
  }

  // Priority 2: TikTok embed
  const tikTokEmbedUrl = videoUrl ? getTikTokEmbedUrl(videoUrl) : null
  if (tikTokEmbedUrl) {
    return (
      <div style={containerStyles} className={className}>
        <iframe
          src={tikTokEmbedUrl}
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
        <LabelOverlay />
      </div>
    )
  }

  // Priority 3: Direct video URL
  if (videoUrl) {
    return (
      <div style={containerStyles} className={className}>
        <video
          ref={videoRef}
          src={videoUrl}
          controls={showControls}
          autoPlay={autoPlay}
          playsInline
          loop
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
          onClick={showControls ? undefined : handlePlayPause}
        />
        <LabelOverlay />
        <PlayButtonOverlay />
      </div>
    )
  }

  // No video available
  return (
    <div style={containerStyles} className={className}>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9D8E7D',
        fontSize: 14,
        fontFamily: '"DM Sans", sans-serif'
      }}>
        Ingen video tillgänglig
      </div>
    </div>
  )
}

export default VideoPlayer
