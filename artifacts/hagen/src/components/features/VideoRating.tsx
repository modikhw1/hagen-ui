'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface VideoRatingProps {
  videoId: string
  videoUrl: string
  onRatingComplete?: () => void
}

export function VideoRating({ videoId, videoUrl, onRatingComplete }: VideoRatingProps) {
  const [ratings, setRatings] = useState({
    overall_rating: 5,
    would_replicate: false,
    hook_strength: 5,
    content_quality: 5,
    engagement_potential: 5,
  })
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch('/api/videos/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          ratings,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
          notes: notes.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Rating failed')
      }

      setSuccess(true)
      if (onRatingComplete) {
        setTimeout(() => onRatingComplete(), 500)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rating failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <h3 className="text-xl font-bold mb-4">Rate This Video</h3>
      
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          ✓ Rating saved! Embeddings generated and stored.
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Overall Rating */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Overall Rating: {ratings.overall_rating}/10
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={ratings.overall_rating}
            onChange={(e) => setRatings({ ...ratings, overall_rating: Number(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={loading || success}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Poor</span>
            <span>Excellent</span>
          </div>
        </div>

        {/* Hook Strength */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Hook Strength: {ratings.hook_strength}/10
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={ratings.hook_strength}
            onChange={(e) => setRatings({ ...ratings, hook_strength: Number(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={loading || success}
          />
        </div>

        {/* Content Quality */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Content Quality: {ratings.content_quality}/10
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={ratings.content_quality}
            onChange={(e) => setRatings({ ...ratings, content_quality: Number(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={loading || success}
          />
        </div>

        {/* Engagement Potential */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Engagement Potential: {ratings.engagement_potential}/10
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={ratings.engagement_potential}
            onChange={(e) => setRatings({ ...ratings, engagement_potential: Number(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={loading || success}
          />
        </div>

        {/* Would Replicate */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="would-replicate"
            checked={ratings.would_replicate}
            onChange={(e) => setRatings({ ...ratings, would_replicate: e.target.checked })}
            className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
            disabled={loading || success}
          />
          <label htmlFor="would-replicate" className="ml-2 text-sm font-medium text-gray-700">
            Would replicate this style/approach
          </label>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g., tutorial, trending, educational"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            disabled={loading || success}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What stood out? What could be improved?"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            disabled={loading || success}
          />
        </div>

        <Button 
          onClick={handleSubmit} 
          disabled={loading || success}
          className="w-full"
        >
          {loading ? <LoadingSpinner size="sm" /> : success ? '✓ Rated' : 'Submit Rating'}
        </Button>
      </div>
    </Card>
  )
}
