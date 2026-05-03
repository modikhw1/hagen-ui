'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface SimilarVideo {
  id: string
  video_url: string
  platform: string
  metadata: any
  rating?: {
    overall_score: number
    dimensions: Record<string, number>
  }
  user_tags: string[]
  similarity: number
}

interface SimilarVideosProps {
  videoId: string
  refreshTrigger?: number
}

export function SimilarVideos({ videoId, refreshTrigger = 0 }: SimilarVideosProps) {
  const [videos, setVideos] = useState<SimilarVideo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSimilar = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/videos/similar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId,
            limit: 5,
            threshold: 0.7,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || 'Failed to fetch similar videos')
        }

        setVideos(data.similarVideos || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load similar videos')
      } finally {
        setLoading(false)
      }
    }

    fetchSimilar()
  }, [videoId, refreshTrigger])

  if (loading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner />
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <div className="text-red-600">
          <p className="font-semibold">Error</p>
          <p>{error}</p>
        </div>
      </Card>
    )
  }

  if (videos.length === 0) {
    return (
      <Card>
        <h3 className="text-xl font-bold mb-4">Similar Videos</h3>
        <p className="text-gray-600">
          No similar videos found yet. Rate a few more videos to build your database!
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <h3 className="text-xl font-bold mb-4">Similar Videos (Based on Embeddings)</h3>
      <div className="space-y-4">
        {videos.map((video) => (
          <div
            key={video.id}
            className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium px-2 py-1 bg-gray-100 rounded">
                    {video.platform}
                  </span>
                  <span className="text-sm font-semibold text-primary-600">
                    {(video.similarity * 100).toFixed(1)}% similar
                  </span>
                </div>
                <a
                  href={video.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm break-all"
                >
                  {video.video_url}
                </a>
              </div>
            </div>

            {video.metadata?.description && (
              <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                {video.metadata.description}
              </p>
            )}

            {video.rating && (
              <div className="flex gap-4 text-xs text-gray-500">
                <span>Rating: {(video.rating.overall_score * 10).toFixed(1)}/10</span>
                {video.rating.dimensions && (
                  <span>
                    Hook: {(video.rating.dimensions.hook * 10).toFixed(1)} | 
                    Payoff: {(video.rating.dimensions.payoff * 10).toFixed(1)}
                  </span>
                )}
              </div>
            )}

            {video.user_tags && video.user_tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {video.user_tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
