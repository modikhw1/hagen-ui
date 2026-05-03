'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface VideoAnalysis {
  id: string
  url: string
  metadata: any
  analysis: any
  computedMetrics: any
  alreadyExists?: boolean
}

export default function AnalyzePage() {
  const [videoUrl, setVideoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VideoAnalysis | null>(null)

  const handleAnalyze = async () => {
    if (!videoUrl.trim()) {
      setError('Please enter a video URL')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/videos/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl, skipIfExists: true })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Analysis failed')
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Analyze Video</h1>
        <p className="text-gray-600">
          Paste a TikTok or YouTube video URL to analyze its content, style, and viral potential
        </p>
      </div>

      <Card className="mb-8">
        <div className="flex gap-4">
          <Input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.tiktok.com/@user/video/..."
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            disabled={loading}
            className="flex-1"
          />
          <Button onClick={handleAnalyze} disabled={loading || !videoUrl.trim()}>
            {loading ? <LoadingSpinner size="sm" /> : 'Analyze'}
          </Button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}
      </Card>

      {result && (
        <div className="space-y-6">
          {result.alreadyExists && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">
              Info: This video was already analyzed. Showing existing data.
            </div>
          )}

          {/* Metadata Section */}
          <Card>
            <h2 className="text-2xl font-bold mb-4">Video Metadata</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600">Platform</div>
                <div className="text-lg font-semibold capitalize">
                  {result.metadata?.platform}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Views</div>
                <div className="text-lg font-semibold">
                  {result.metadata?.stats?.viewCount?.toLocaleString() || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Likes</div>
                <div className="text-lg font-semibold">
                  {result.metadata?.stats?.likeCount?.toLocaleString() || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Comments</div>
                <div className="text-lg font-semibold">
                  {result.metadata?.stats?.commentCount?.toLocaleString() || 'N/A'}
                </div>
              </div>
            </div>

            {result.metadata?.title && (
              <div className="mt-4">
                <div className="text-sm text-gray-600">Title</div>
                <div className="text-base">{result.metadata.title}</div>
              </div>
            )}

            {result.metadata?.description && (
              <div className="mt-4">
                <div className="text-sm text-gray-600">Description</div>
                <div className="text-base">{result.metadata.description}</div>
              </div>
            )}
          </Card>

          {/* Computed Metrics Section */}
          {result.computedMetrics && (
            <Card>
              <h2 className="text-2xl font-bold mb-4">Computed Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <MetricCard
                  label="Engagement Rate"
                  value={`${(result.computedMetrics.engagement_rate * 100).toFixed(2)}%`}
                  description="Likes + comments relative to views"
                />
                <MetricCard
                  label="Viral Coefficient"
                  value={result.computedMetrics.viral_coefficient?.toFixed(2)}
                  description="Shares per view ratio"
                />
                <MetricCard
                  label="Viral Potential"
                  value={`${(result.computedMetrics.viral_potential * 10).toFixed(1)}/10`}
                  description="Predicted viral success"
                />
                <MetricCard
                  label="Comment Rate"
                  value={`${(result.computedMetrics.comment_rate * 100).toFixed(2)}%`}
                  description="Comments relative to likes"
                />
                <MetricCard
                  label="Freshness"
                  value={`${(result.computedMetrics.freshness_score * 10).toFixed(1)}/10`}
                  description="Recency score"
                />
                <MetricCard
                  label="Relative Performance"
                  value={result.computedMetrics.relative_performance?.toFixed(2)}
                  description="Performance vs channel average"
                />
              </div>
            </Card>
          )}

          {/* Analysis Section */}
          {result.analysis && (
            <>
              <Card>
                <h2 className="text-2xl font-bold mb-4">Visual Analysis</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <MetricCard
                    label="Hook Strength"
                    value={`${result.analysis.visual.hookStrength}/10`}
                    description={result.analysis.visual.hookDescription}
                  />
                  <MetricCard
                    label="Overall Quality"
                    value={`${result.analysis.visual.overallQuality}/10`}
                  />
                  <MetricCard
                    label="Color Diversity"
                    value={`${result.analysis.visual.colorDiversity}/10`}
                  />
                </div>
                <div className="prose max-w-none">
                  <p className="text-gray-700">{result.analysis.visual.summary}</p>
                </div>
              </Card>

              <Card>
                <h2 className="text-2xl font-bold mb-4">Audio Analysis</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <MetricCard
                    label="Audio Quality"
                    value={`${result.analysis.audio.quality}/10`}
                  />
                  <MetricCard
                    label="Energy Level"
                    value={result.analysis.audio.energyLevel}
                  />
                  <MetricCard
                    label="Music Type"
                    value={result.analysis.audio.musicType}
                  />
                </div>
              </Card>

              <Card>
                <h2 className="text-2xl font-bold mb-4">Content Analysis</h2>
                <div className="space-y-3">
                  <InfoRow label="Topic" value={result.analysis.content.topic} />
                  <InfoRow label="Style" value={result.analysis.content.style} />
                  <InfoRow label="Format" value={result.analysis.content.format} />
                  <InfoRow label="Key Message" value={result.analysis.content.keyMessage} />
                  <InfoRow
                    label="Target Audience"
                    value={result.analysis.content.targetAudience}
                  />
                </div>
              </Card>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button onClick={() => window.location.href = `/rate?id=${result.id}`}>
              Rate This Video
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.location.href = `/similar?id=${result.id}`}
            >
              Find Similar Videos
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  description
}: {
  label: string
  value: string | number
  description?: string
}) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      {description && <div className="text-xs text-gray-500">{description}</div>}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <div className="text-sm text-gray-600 w-32 flex-shrink-0">{label}:</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )
}
