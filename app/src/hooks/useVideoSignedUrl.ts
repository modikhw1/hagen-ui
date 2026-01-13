import { useState, useEffect } from 'react'

interface UseVideoSignedUrlOptions {
  gcsUri?: string
  enabled?: boolean
}

interface UseVideoSignedUrlReturn {
  signedUrl: string | null
  isLoading: boolean
  error: string | null
}

/**
 * Custom hook to fetch signed URLs for GCS videos
 * Shared logic across mobile and desktop
 */
export function useVideoSignedUrl({
  gcsUri,
  enabled = true
}: UseVideoSignedUrlOptions): UseVideoSignedUrlReturn {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gcsUri || !enabled || signedUrl || isLoading) {
      return
    }

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
  }, [gcsUri, enabled, signedUrl, isLoading])

  return { signedUrl, isLoading, error }
}
