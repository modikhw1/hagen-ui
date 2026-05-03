'use client'

import { useState } from 'react'
import { Card, Button, LoadingSpinner } from '@/components/ui'

export interface VideoInterpretation {
  url: string
  platform: string
  videoId?: string
  analyzedVideoId?: string  // DB ID for corrections
  analysis: {
    summary: string
    humorType?: string
    whyFunny?: string
    tone: string
    style: string
    targetAudience?: string
    conceptCore?: string
    brandRelevance: string
  }
  fromCache: boolean
  isAnalyzing?: boolean
  error?: string
}

interface CorrectionField {
  field: string
  label: string
  original: string
  corrected: string
}

interface VideoInterpretationCardProps {
  interpretation: VideoInterpretation
  onCorrection?: (videoId: string, corrections: Record<string, string>, note: string) => Promise<void>
  onDismiss?: () => void
  compact?: boolean
}

export function VideoInterpretationCard({
  interpretation,
  onCorrection,
  onDismiss,
  compact = false
}: VideoInterpretationCardProps) {
  const [isExpanded, setIsExpanded] = useState(!compact)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [correctionNote, setCorrectionNote] = useState('')
  const [corrections, setCorrections] = useState<Record<string, string>>({})
  const [showSuccess, setShowSuccess] = useState(false)

  const { analysis, platform, url, isAnalyzing, error } = interpretation

  // Get platform icon
  const platformLabel = {
    tiktok: 'TikTok',
    youtube: 'YouTube',
    instagram: 'Instagram',
    unknown: 'Video'
  }[platform] || 'Video'

  // Get platform color
  const platformColor = {
    tiktok: 'from-pink-500/20 to-purple-500/20 border-pink-500/30',
    youtube: 'from-red-500/20 to-orange-500/20 border-red-500/30',
    instagram: 'from-purple-500/20 to-pink-500/20 border-purple-500/30',
    unknown: 'from-gray-500/20 to-gray-600/20 border-gray-500/30'
  }[platform] || 'from-gray-500/20 to-gray-600/20 border-gray-500/30'

  const handleStartEditing = () => {
    setIsEditing(true)
    // Initialize corrections with current values
    setCorrections({
      tone: analysis.tone,
      style: analysis.style,
      humorType: analysis.humorType || '',
      whyFunny: analysis.whyFunny || '',
      conceptCore: analysis.conceptCore || '',
    })
  }

  const handleCancelEditing = () => {
    setIsEditing(false)
    setCorrections({})
    setCorrectionNote('')
  }

  const handleSaveCorrections = async () => {
    if (!onCorrection || !interpretation.analyzedVideoId) return
    
    setIsSaving(true)
    try {
      // Only include fields that actually changed
      const changedCorrections: Record<string, string> = {}
      if (corrections.tone !== analysis.tone) changedCorrections.tone = corrections.tone
      if (corrections.style !== analysis.style) changedCorrections.style = corrections.style
      if (corrections.humorType !== (analysis.humorType || '')) changedCorrections.humorType = corrections.humorType
      if (corrections.whyFunny !== (analysis.whyFunny || '')) changedCorrections.whyFunny = corrections.whyFunny
      if (corrections.conceptCore !== (analysis.conceptCore || '')) changedCorrections.conceptCore = corrections.conceptCore

      await onCorrection(interpretation.analyzedVideoId, changedCorrections, correctionNote)
      
      setShowSuccess(true)
      setIsEditing(false)
      setCorrectionNote('')
      
      setTimeout(() => setShowSuccess(false), 2000)
    } catch (error) {
      console.error('Failed to save corrections:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Loading state
  if (isAnalyzing) {
    return (
      <div className={`bg-gradient-to-r ${platformColor} border rounded-lg p-3 animate-pulse`}>
        <div className="flex items-center gap-3">
          <span className="text-xl">{platformLabel}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <LoadingSpinner size="sm" />
              <span className="text-sm text-gray-300">Analyzing video...</span>
            </div>
            <div className="text-xs text-gray-500 truncate mt-1">{url}</div>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <div className="text-sm text-red-400">Analysis failed</div>
              <div className="text-xs text-gray-500 truncate max-w-xs">{url}</div>
            </div>
          </div>
          {onDismiss && (
            <button onClick={onDismiss} className="text-gray-500 hover:text-gray-400">×</button>
          )}
        </div>
      </div>
    )
  }

  // Compact view (just a pill showing key info)
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={`bg-gradient-to-r ${platformColor} border rounded-lg p-2 w-full text-left hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          <span>{platformLabel}</span>
          <span className="text-sm text-gray-300 flex-1 truncate">
            {analysis.tone} • {analysis.style}
            {analysis.humorType && ` • ${analysis.humorType}`}
          </span>
          <span className="text-xs text-gray-500">▼</span>
        </div>
      </button>
    )
  }

  // Expanded view with interpretation details
  return (
    <div className={`bg-gradient-to-r ${platformColor} border rounded-lg overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          <span className="text-xl">{platformLabel}</span>
          <div>
            <div className="text-sm font-medium text-white">
              Gemini Interpretation
              {interpretation.fromCache && (
                <span className="ml-2 text-xs text-gray-500">(cached)</span>
              )}
            </div>
            <a 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 truncate max-w-xs block"
            >
              {url}
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showSuccess && (
            <span className="text-xs text-green-400">✓ Saved to Gemini data</span>
          )}
          {compact && (
            <button 
              onClick={() => setIsExpanded(false)} 
              className="text-gray-500 hover:text-gray-400 text-sm"
            >
              ▲
            </button>
          )}
          {onDismiss && (
            <button onClick={onDismiss} className="text-gray-500 hover:text-gray-400">×</button>
          )}
        </div>
      </div>

      {/* Interpretation Content */}
      <div className="p-3 space-y-3">
        {/* Key attributes grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {isEditing ? (
            <>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tone</label>
                <input
                  type="text"
                  value={corrections.tone || ''}
                  onChange={(e) => setCorrections(prev => ({ ...prev, tone: e.target.value }))}
                  className="w-full bg-gray-800 text-white px-2 py-1 rounded text-sm border border-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Style</label>
                <input
                  type="text"
                  value={corrections.style || ''}
                  onChange={(e) => setCorrections(prev => ({ ...prev, style: e.target.value }))}
                  className="w-full bg-gray-800 text-white px-2 py-1 rounded text-sm border border-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Humor Type</label>
                <input
                  type="text"
                  value={corrections.humorType || ''}
                  onChange={(e) => setCorrections(prev => ({ ...prev, humorType: e.target.value }))}
                  className="w-full bg-gray-800 text-white px-2 py-1 rounded text-sm border border-gray-600 focus:border-purple-500 focus:outline-none"
                  placeholder="e.g., absurdist, relatable"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Concept Core</label>
                <input
                  type="text"
                  value={corrections.conceptCore || ''}
                  onChange={(e) => setCorrections(prev => ({ ...prev, conceptCore: e.target.value }))}
                  className="w-full bg-gray-800 text-white px-2 py-1 rounded text-sm border border-gray-600 focus:border-purple-500 focus:outline-none"
                  placeholder="What makes it work?"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Why It Works</label>
                <textarea
                  value={corrections.whyFunny || ''}
                  onChange={(e) => setCorrections(prev => ({ ...prev, whyFunny: e.target.value }))}
                  className="w-full bg-gray-800 text-white px-2 py-1 rounded text-sm border border-gray-600 focus:border-purple-500 focus:outline-none resize-none"
                  rows={2}
                  placeholder="Explain the humor/appeal"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-xs text-gray-500">Tone</span>
                <div className="text-white">{analysis.tone}</div>
              </div>
              <div>
                <span className="text-xs text-gray-500">Style</span>
                <div className="text-white">{analysis.style}</div>
              </div>
              {analysis.humorType && (
                <div>
                  <span className="text-xs text-gray-500">Humor</span>
                  <div className="text-white">{analysis.humorType}</div>
                </div>
              )}
              {analysis.conceptCore && (
                <div>
                  <span className="text-xs text-gray-500">Concept</span>
                  <div className="text-white">{analysis.conceptCore}</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Why it works */}
        {!isEditing && analysis.whyFunny && (
          <div className="text-sm">
            <span className="text-xs text-gray-500 block mb-1">Why it works</span>
            <p className="text-gray-300">{analysis.whyFunny}</p>
          </div>
        )}

        {/* Summary */}
        <div className="text-sm">
          <span className="text-xs text-gray-500 block mb-1">Summary</span>
          <p className="text-gray-400 text-xs">{analysis.summary}</p>
        </div>

        {/* Correction note (when editing) */}
        {isEditing && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Correction Note (helps train Gemini)
            </label>
            <textarea
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
              className="w-full bg-gray-800 text-white px-2 py-2 rounded text-sm border border-yellow-600/50 focus:border-yellow-500 focus:outline-none resize-none"
              rows={2}
              placeholder="Explain what Gemini got wrong and why..."
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
          {isEditing ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveCorrections}
                disabled={isSaving || !interpretation.analyzedVideoId}
              >
                {isSaving ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-1">Saving...</span>
                  </>
                ) : (
                  '💾 Save to Gemini Data'
                )}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCancelEditing}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {interpretation.analyzedVideoId && onCorrection && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleStartEditing}
                  title="Correct this interpretation - changes go back to Gemini training data"
                >
                  Correct Gemini
                </Button>
              )}
            </div>
          )}
          
          <div className="text-xs text-gray-500">
            {interpretation.fromCache ? 'From cache' : 'Fresh analysis'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default VideoInterpretationCard
