'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button, Card, Input, LoadingSpinner } from '@/components/ui'
import { VideoInterpretationCard, type VideoInterpretation } from '@/components/features'

interface Message {
  role: 'user' | 'assistant'
  content: string
  id: string
  dbMessageId?: string  // ID from database for persisting notes
  trainingNote?: string
  videoInterpretations?: VideoInterpretation[]  // Associated video analyses
}

interface ConversationInfo {
  conversationId: string
  profileId: string
  brandName: string
  currentPhase: string
}

interface ConversationNotes {
  masterNote: string
}

// Helper to generate unique message IDs
const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

interface BrandSynthesis {
  narrative_summary: string
  characteristics: Record<string, any>
  tone: Record<string, any>
  current_state: Record<string, any>
  goals: Record<string, any>
  target_audience: Record<string, any>
  key_insights: string[]
  content_recommendations: {
    formats_likely_to_fit: string[]
    formats_to_avoid: string[]
    topics_to_explore: string[]
    production_level: string
  }
}

interface VideoMatch {
  id: string
  video_url: string
  platform: string
  title?: string
  similarity: number
  quality_tier?: string
  brand_tone_notes?: string
  // v1.1 fingerprint matching fields
  passed_filters?: boolean
  filter_results?: {
    passed: boolean
    failed_filters: string[]
    warnings: string[]
  }
  score_breakdown?: {
    audience_alignment: number
    tone_match: number
    format_appropriateness: number
    aspiration_alignment: number
  }
  explanation?: string
}

const PHASE_LABELS: Record<string, string> = {
  introduction: 'Getting to Know You',
  business_goals: 'Business Goals',
  social_goals: 'Social Media Goals',
  tone_discovery: 'Finding Your Voice',
  audience: 'Your Audience',
  references: 'Inspiration',
  synthesis: 'Profile Summary'
}

export default function BrandProfilePage() {
  const [brandName, setBrandName] = useState('')
  const [conversationInfo, setConversationInfo] = useState<ConversationInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [synthesis, setSynthesis] = useState<BrandSynthesis | null>(null)
  const [matchedVideos, setMatchedVideos] = useState<VideoMatch[]>([])
  const [isFindingMatches, setIsFindingMatches] = useState(false)
  const [referenceUrl, setReferenceUrl] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteInputValue, setNoteInputValue] = useState('')
  const [conversationNotes, setConversationNotes] = useState<ConversationNotes>({
    masterNote: ''
  })
  const [showMasterNotes, setShowMasterNotes] = useState(false)
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  
  // NEW v1.1: Fingerprint constraint states
  const [operationalConstraints, setOperationalConstraints] = useState<{
    team_size: string
    time_per_video: string
    equipment: string[]
  }>({
    team_size: 'solo',
    time_per_video: 'under_1hr',
    equipment: ['smartphone']
  })
  
  const [environmentAvailability, setEnvironmentAvailability] = useState<{
    settings: string[]
    can_feature_customers: boolean | null
    space: string
  }>({
    settings: [],
    can_feature_customers: null,
    space: 'moderate'
  })
  
  const [ambitionLevel, setAmbitionLevel] = useState<string>('level_up')
  
  // NEW v1.1: Target audience preferences (from brand perspective)
  const [targetAudiencePrefs, setTargetAudiencePrefs] = useState<{
    primary_age: string | null
    income_level: string | null
    lifestyle_tags: string[]
    vibe: string | null
  }>({
    primary_age: null,
    income_level: null,
    lifestyle_tags: [],
    vibe: null
  })
  
  // NEW v1.1: Risk tolerance
  const [riskTolerance, setRiskTolerance] = useState<{
    content_edge: string
    humor_risk: string
  }>({
    content_edge: 'brand_safe',
    humor_risk: 'playful'
  })
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const startConversation = async () => {
    if (!brandName.trim()) return

    setIsStarting(true)
    setMessages([])
    setSynthesis(null)
    setMatchedVideos([])

    try {
      const response = await fetch('/api/brand-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start conversation')
      }

      const data = await response.json()

      setConversationInfo({
        conversationId: data.conversationId,
        profileId: data.profileId,
        brandName,
        currentPhase: data.currentPhase
      })

      setMessages([{
        id: generateMessageId(),
        role: 'assistant',
        content: data.openingMessage
      }])

    } catch (error) {
      console.error('Start conversation error:', error)
      setMessages([{
        id: generateMessageId(),
        role: 'assistant',
        content: `Sorry, I couldn't start the conversation. ${error instanceof Error ? error.message : 'Please try again.'}`
      }])
    } finally {
      setIsStarting(false)
    }
  }

  const sendMessage = async (message?: string) => {
    const messageToSend = message || inputValue.trim()
    if (!messageToSend || !conversationInfo) return

    setInputValue('')
    setIsLoading(true)

    const userMsgId = generateMessageId()
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: messageToSend }])

    try {
      const response = await fetch('/api/brand-profile/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationInfo.conversationId,
          message: messageToSend
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send message')
      }

      const data = await response.json()

      // Update phase if changed
      if (data.nextPhase) {
        setConversationInfo(prev => prev ? {
          ...prev,
          currentPhase: data.nextPhase
        } : null)
      }

      // Convert video analyses to VideoInterpretation format
      const videoInterpretations: VideoInterpretation[] | undefined = data.videoAnalyses?.map((v: any) => ({
        url: v.url,
        platform: v.platform,
        videoId: v.videoId,
        analyzedVideoId: v.videoId, // The DB ID for corrections
        analysis: v.analysis,
        fromCache: v.fromCache
      }))

      // Update user message with database ID, video interpretations, and add assistant message
      setMessages(prev => {
        const updated = prev.map(msg => 
          msg.id === userMsgId 
            ? { 
                ...msg, 
                dbMessageId: data.userMessageId,
                videoInterpretations 
              }
            : msg
        )
        return [...updated, {
          id: generateMessageId(),
          dbMessageId: data.assistantMessageId,
          role: 'assistant' as const,
          content: data.message
        }]
      })

    } catch (error) {
      console.error('Send message error:', error)
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        role: 'assistant',
        content: `Sorry, something went wrong. ${error instanceof Error ? error.message : ''}`
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleTransition = async () => {
    if (!conversationInfo) return

    setIsLoading(true)

    try {
      const response = await fetch('/api/brand-profile/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationInfo.conversationId,
          action: 'transition'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to transition')
      }

      const data = await response.json()

      setConversationInfo(prev => prev ? {
        ...prev,
        currentPhase: data.newPhase
      } : null)

      setMessages(prev => [...prev, {
        id: generateMessageId(),
        role: 'assistant',
        content: data.message
      }])

    } catch (error) {
      console.error('Transition error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSynthesize = async () => {
    if (!conversationInfo) return

    setIsLoading(true)
    setMessages(prev => [...prev, {
      id: generateMessageId(),
      role: 'user',
      content: '[Generating brand profile...]'
    }])

    try {
      const response = await fetch('/api/brand-profile/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationInfo.conversationId,
          action: 'synthesize'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate profile')
      }

      const data = await response.json()
      setSynthesis(data.synthesis)
      
      // Pre-populate UI constraints from synthesis data (Schema v1.1 integration)
      const synth = data.synthesis
      
      // Operational constraints from synthesis
      if (synth.operational_constraints || synth.characteristics) {
        const ops = synth.operational_constraints || {}
        const chars = synth.characteristics || {}
        
        setOperationalConstraints(prev => ({
          team_size: ops.team_available || (chars.team_size === 'small' ? 'solo' : chars.team_size === 'medium' ? 'small_team' : prev.team_size),
          time_per_video: ops.time_budget || prev.time_per_video,
          equipment: ops.equipment_available?.length ? ops.equipment_available : prev.equipment
        }))
      }
      
      // Environment availability from synthesis
      if (synth.environment_availability) {
        const env = synth.environment_availability
        setEnvironmentAvailability(prev => ({
          settings: env.available_locations?.length ? env.available_locations : prev.settings,
          can_feature_customers: env.customer_filming_ok ?? prev.can_feature_customers,
          space: env.space_quality || prev.space
        }))
      }
      
      // Target audience from synthesis
      if (synth.target_audience) {
        const audience = synth.target_audience
        setTargetAudiencePrefs(prev => ({
          primary_age: audience.primary_generation || prev.primary_age,
          income_level: audience.income_level || prev.income_level,
          lifestyle_tags: audience.lifestyle_tags?.length ? audience.lifestyle_tags : prev.lifestyle_tags,
          vibe: audience.vibe_alignment || prev.vibe
        }))
      }
      
      // Risk tolerance from synthesis
      if (synth.risk_tolerance) {
        const risk = synth.risk_tolerance
        setRiskTolerance(prev => ({
          content_edge: risk.content_edge || prev.content_edge,
          humor_risk: risk.humor_style || prev.humor_risk
        }))
      }

      setMessages(prev => [...prev, {
        id: generateMessageId(),
        role: 'assistant',
        content: `I've created your brand profile! Here's what I learned about ${conversationInfo.brandName}:\n\n${data.synthesis.narrative_summary}`
      }])

      setConversationInfo(prev => prev ? {
        ...prev,
        currentPhase: 'synthesis'
      } : null)

    } catch (error) {
      console.error('Synthesis error:', error)
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        role: 'assistant',
        content: `Sorry, I couldn't generate the brand profile. ${error instanceof Error ? error.message : ''}`
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleFindMatches = async () => {
    if (!conversationInfo) return

    setIsFindingMatches(true)

    try {
      const response = await fetch(`/api/brand-profile/${conversationInfo.profileId}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 10,
          threshold: 0.5,
          regenerateEmbedding: true,
          // NEW v1.1: Pass fingerprint constraints
          fingerprint: {
            operational_constraints: operationalConstraints,
            environment_availability: environmentAvailability,
            ambition_level: ambitionLevel,
            target_audience: targetAudiencePrefs,
            risk_tolerance: riskTolerance
          }
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to find matches')
      }

      const data = await response.json()
      setMatchedVideos(data.matches || [])

    } catch (error) {
      console.error('Match error:', error)
    } finally {
      setIsFindingMatches(false)
    }
  }

  const handleAddReferenceVideo = async () => {
    if (!referenceUrl.trim() || !conversationInfo) return

    try {
      const response = await fetch(`/api/brand-profile/${conversationInfo.profileId}/reference-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: referenceUrl,
          reason: 'Added during conversation'
        })
      })

      if (response.ok) {
        setReferenceUrl('')
        setMessages(prev => [...prev, {
          id: generateMessageId(),
          role: 'assistant',
          content: `Great, I've saved that video as a reference! It helps me understand what you're going for. Let's continue - what is it about that video that resonates with you?`
        }])
      }
    } catch (error) {
      console.error('Add reference error:', error)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Handle corrections to Gemini interpretations
  const handleVideoCorrection = async (
    videoId: string, 
    corrections: Record<string, string>, 
    note: string
  ) => {
    try {
      const response = await fetch('/api/brand-profile/video-correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analyzedVideoId: videoId,
          corrections,
          correctionNote: note,
          conversationId: conversationInfo?.conversationId
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save correction')
      }

      console.log('Correction saved to Gemini training data')
    } catch (error) {
      console.error('Correction error:', error)
      throw error
    }
  }

  // Handle saving a note for a specific message
  const handleSaveNote = (messageId: string) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, trainingNote: noteInputValue }
        : msg
    ))
    setEditingNoteId(null)
    setNoteInputValue('')
  }

  // Handle starting to edit a note
  const handleEditNote = (messageId: string, existingNote?: string) => {
    setEditingNoteId(messageId)
    setNoteInputValue(existingNote || '')
  }

  // Handle canceling note edit
  const handleCancelNote = () => {
    setEditingNoteId(null)
    setNoteInputValue('')
  }

  // Auto-save notes to database (debounced)
  const saveNotesToDatabase = useCallback(async () => {
    if (!conversationInfo) return

    setIsSavingNotes(true)
    setNotesSaved(false)

    try {
      // Collect message notes that have dbMessageId (from database)
      const messageNotes = messages
        .filter(m => m.dbMessageId && m.trainingNote)
        .map(m => ({
          messageId: m.dbMessageId!,
          note: m.trainingNote!
        }))

      await fetch('/api/brand-profile/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationInfo.conversationId,
          messageNotes,
          sessionNotes: conversationNotes.masterNote
        })
      })

      setNotesSaved(true)
      // Clear saved indicator after 2 seconds
      setTimeout(() => setNotesSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save notes:', error)
    } finally {
      setIsSavingNotes(false)
    }
  }, [conversationInfo, messages, conversationNotes.masterNote])

  // Debounced auto-save when notes change
  useEffect(() => {
    if (!conversationInfo) return
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new timeout for 2 seconds after last change
    saveTimeoutRef.current = setTimeout(() => {
      const hasNotes = messages.some(m => m.trainingNote) || conversationNotes.masterNote
      if (hasNotes) {
        saveNotesToDatabase()
      }
    }, 2000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [messages, conversationNotes.masterNote, conversationInfo, saveNotesToDatabase])

  const currentPhaseLabel = conversationInfo 
    ? PHASE_LABELS[conversationInfo.currentPhase] || conversationInfo.currentPhase
    : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Brand Discovery
          </h1>
          <p className="text-gray-400">
            Let&apos;s understand your brand&apos;s unique voice and find content that fits
          </p>
        </div>

        {/* Start Conversation */}
        {!conversationInfo && (
          <Card className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">
              Start Your Brand Profile
            </h2>
            <p className="text-gray-400 mb-4">
              I&apos;ll ask you some questions to understand your business, your voice, and what content would resonate with your brand.
            </p>
            <div className="flex gap-4">
              <Input
                placeholder="What's your business or brand name?"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="flex-1"
                disabled={isStarting}
              />
              <Button
                onClick={startConversation}
                disabled={!brandName.trim() || isStarting}
              >
                {isStarting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Starting...</span>
                  </>
                ) : (
                  'Begin'
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* Session Info */}
        {conversationInfo && (
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="px-3 py-1 rounded-full bg-purple-600/30 text-purple-300 text-sm font-medium">
                {conversationInfo.brandName}
              </span>
              <span className="text-gray-400 text-sm">
                {currentPhaseLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowMasterNotes(!showMasterNotes)}
                className={showMasterNotes ? 'bg-yellow-600/20 text-yellow-400' : ''}
              >
                📋 {showMasterNotes ? 'Hide Notes' : 'Session Notes'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setConversationInfo(null)
                  setMessages([])
                  setSynthesis(null)
                  setMatchedVideos([])
                  setBrandName('')
                  setConversationNotes({ masterNote: '' })
                  setShowMasterNotes(false)
                }}
              >
                Start Over
              </Button>
            </div>
          </div>
        )}

        {/* Master Notes Panel */}
        {conversationInfo && showMasterNotes && (
          <Card className="mb-4 bg-yellow-900/10 border border-yellow-600/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-yellow-400">📋 Session Notes</h3>
              <div className="flex items-center gap-2">
                {isSavingNotes && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <LoadingSpinner size="sm" /> Saving...
                  </span>
                )}
                {notesSaved && !isSavingNotes && (
                  <span className="text-xs text-green-400">✓ Saved</span>
                )}
                {!isSavingNotes && !notesSaved && (
                  <span className="text-xs text-gray-500">Auto-saves after changes</span>
                )}
              </div>
            </div>
            <textarea
              value={conversationNotes.masterNote}
              onChange={(e) => setConversationNotes(prev => ({ ...prev, masterNote: e.target.value }))}
              placeholder="Overall thoughts on this conversation...&#10;&#10;What worked well? What felt unnatural? What questions should be asked differently? What data would be useful to capture? Any patterns or insights about the conversation flow?"
              className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-yellow-500 resize-y min-h-[120px]"
              rows={5}
            />
          </Card>
        )}

        {/* Chat Messages */}
        {messages.length > 0 && (
          <Card className="mb-4 max-h-[450px] overflow-y-auto">
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-100'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>

                  {/* Video Interpretation Cards (shown under user messages that contain links) */}
                  {msg.role === 'user' && msg.videoInterpretations && msg.videoInterpretations.length > 0 && (
                    <div className="mt-2 w-full max-w-[85%] ml-auto space-y-2">
                      {msg.videoInterpretations.map((interpretation, idx) => (
                        <VideoInterpretationCard
                          key={`${msg.id}-video-${idx}`}
                          interpretation={interpretation}
                          onCorrection={handleVideoCorrection}
                          compact={true}
                        />
                      ))}
                    </div>
                  )}
                  
                  {/* Note button and display */}
                  <div className={`mt-1 w-full max-w-[85%] ${msg.role === 'user' ? 'ml-auto' : ''}`}>
                    {editingNoteId === msg.id ? (
                      <div className="bg-gray-800 rounded-lg p-3 mt-1 border border-yellow-600/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-yellow-400">
                            {msg.role === 'assistant' ? 'Claude Feedback' : 'Training Note'}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveNote(msg.id)}
                              className="text-green-400 hover:text-green-300 text-xs px-2 py-1 bg-green-900/30 rounded"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelNote}
                              className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-900/30 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={noteInputValue}
                          onChange={(e) => setNoteInputValue(e.target.value)}
                          placeholder={msg.role === 'assistant' 
                            ? "Feedback for Claude's response: Was this helpful? What was wrong? How should it respond instead?"
                            : "Note about this message or the video link shared"
                          }
                          className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-yellow-500 resize-y min-h-[80px]"
                          rows={4}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              handleCancelNote()
                            }
                          }}
                        />
                        {msg.role === 'assistant' && (
                          <p className="text-xs text-gray-500 mt-2">
                            Tip: This feedback trains Claude&apos;s conversation style. For video interpretation corrections, use the &quot;Correct Gemini&quot; button on the video card above.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <button
                          onClick={() => handleEditNote(msg.id, msg.trainingNote)}
                          className={`text-xs px-2 py-1 rounded transition-colors flex-shrink-0 ${
                            msg.trainingNote 
                              ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30' 
                              : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700/50'
                          }`}
                          title={msg.trainingNote ? 'Edit note' : 'Add training note'}
                        >
                          {msg.trainingNote ? 'Note' : '+'}
                        </button>
                        {msg.trainingNote && (
                          <div 
                            className="text-xs text-yellow-400/80 italic bg-yellow-900/10 px-2 py-1 rounded cursor-pointer hover:bg-yellow-900/20"
                            onClick={() => handleEditNote(msg.id, msg.trainingNote)}
                          >
                            {msg.trainingNote}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-700 rounded-lg px-4 py-3">
                    <LoadingSpinner size="sm" />
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </Card>
        )}

        {/* Reference Video Input (shown during references phase) */}
        {conversationInfo?.currentPhase === 'references' && !synthesis && (
          <Card className="mb-4 bg-gray-800/50">
            <h3 className="text-sm font-medium text-gray-300 mb-2">
              📎 Add a video you admire
            </h3>
            <div className="flex gap-2">
              <Input
                placeholder="Paste TikTok, YouTube, or Instagram URL..."
                value={referenceUrl}
                onChange={(e) => setReferenceUrl(e.target.value)}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={handleAddReferenceVideo}
                disabled={!referenceUrl.trim()}
              >
                Add
              </Button>
            </div>
          </Card>
        )}

        {/* Input Area */}
        {conversationInfo && !synthesis && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Share your thoughts..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={() => sendMessage()}
                disabled={!inputValue.trim() || isLoading}
              >
                Send
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTransition}
                disabled={isLoading}
              >
                Next Topic →
              </Button>
              {messages.length >= 6 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSynthesize}
                  disabled={isLoading}
                >
                  Generate Profile
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Synthesis Display */}
        {synthesis && (
          <div className="space-y-6">
            {/* Tone Profile */}
            <Card>
              <h3 className="text-lg font-semibold text-white mb-4">Tone Profile</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {synthesis.tone.primary && (
                  <div className="text-center">
                    <div className="text-2xl mb-1">●</div>
                    <div className="text-sm text-gray-400">Primary</div>
                    <div className="text-white font-medium capitalize">{synthesis.tone.primary}</div>
                  </div>
                )}
                {synthesis.tone.energy_level && (
                  <div className="text-center">
                    <div className="text-2xl mb-1">◆</div>
                    <div className="text-sm text-gray-400">Energy</div>
                    <div className="text-white font-medium">{synthesis.tone.energy_level}/10</div>
                  </div>
                )}
                {synthesis.tone.humor_tolerance && (
                  <div className="text-center">
                    <div className="text-2xl mb-1">😄</div>
                    <div className="text-sm text-gray-400">Humor</div>
                    <div className="text-white font-medium">{synthesis.tone.humor_tolerance}/10</div>
                  </div>
                )}
                {synthesis.tone.formality && (
                  <div className="text-center">
                    <div className="text-2xl mb-1">👔</div>
                    <div className="text-sm text-gray-400">Formality</div>
                    <div className="text-white font-medium">{synthesis.tone.formality}/10</div>
                  </div>
                )}
              </div>
              {synthesis.tone.avoid && synthesis.tone.avoid.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <span className="text-sm text-gray-400">Avoid: </span>
                  <span className="text-red-400">{synthesis.tone.avoid.join(', ')}</span>
                </div>
              )}
            </Card>

            {/* Key Insights */}
            <Card>
              <h3 className="text-lg font-semibold text-white mb-4">Key Insights</h3>
              <ul className="space-y-2">
                {synthesis.key_insights?.map((insight, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-gray-300">
                    <span className="text-purple-400">•</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </Card>

            {/* Content Recommendations */}
            <Card>
              <h3 className="text-lg font-semibold text-white mb-4">Content Recommendations</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Formats that would work</h4>
                  <div className="flex flex-wrap gap-2">
                    {synthesis.content_recommendations?.formats_likely_to_fit?.map((format, idx) => (
                      <span key={idx} className="px-2 py-1 bg-green-600/20 text-green-300 rounded text-sm">
                        {format}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Topics to explore</h4>
                  <div className="flex flex-wrap gap-2">
                    {synthesis.content_recommendations?.topics_to_explore?.map((topic, idx) => (
                      <span key={idx} className="px-2 py-1 bg-blue-600/20 text-blue-300 rounded text-sm">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* NEW v1.1: Operational Constraints */}
            <Card>
              <h3 className="text-lg font-semibold text-white mb-4">What Can You Realistically Produce?</h3>
              <p className="text-sm text-gray-400 mb-4">Help us match you with content you can actually recreate.</p>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Team Size */}
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">Team Size Available</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'solo', label: 'Just Me' },
                      { value: 'duo', label: '2 People' },
                      { value: 'small_team', label: '3-5 People' },
                      { value: 'large_team', label: '5+ People' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setOperationalConstraints(prev => ({ ...prev, team_size: opt.value }))}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          operationalConstraints.team_size === opt.value
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time Per Video */}
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">Time You Can Spend Per Video</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'under_1hr', label: 'Under 1hr' },
                      { value: '1_4hrs', label: '1-4 Hours' },
                      { value: 'half_day', label: 'Half Day' },
                      { value: 'full_day', label: 'Full Day' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setOperationalConstraints(prev => ({ ...prev, time_per_video: opt.value }))}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          operationalConstraints.time_per_video === opt.value
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Equipment */}
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-300 block mb-2">Equipment Available</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'smartphone', label: 'Smartphone' },
                      { value: 'tripod', label: 'Tripod' },
                      { value: 'ring_light', label: 'Ring Light' },
                      { value: 'microphone', label: 'Microphone' },
                      { value: 'camera', label: 'Camera' },
                      { value: 'editing_software', label: 'Editing Software' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setOperationalConstraints(prev => ({
                            ...prev,
                            equipment: prev.equipment.includes(opt.value)
                              ? prev.equipment.filter(e => e !== opt.value)
                              : [...prev.equipment, opt.value]
                          }))
                        }}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          operationalConstraints.equipment.includes(opt.value)
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* NEW v1.1: Environment Availability */}
            <Card>
              <h3 className="text-lg font-semibold text-white mb-4">Where Can You Film?</h3>
              <p className="text-sm text-gray-400 mb-4">Select all the spaces you have access to for content creation.</p>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Available Settings */}
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-300 block mb-2">Available Locations</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'kitchen', label: 'Kitchen' },
                      { value: 'dining_room', label: 'Dining Room' },
                      { value: 'bar', label: 'Bar Area' },
                      { value: 'storefront', label: 'Storefront' },
                      { value: 'outdoor', label: 'Outdoor Patio' },
                      { value: 'offsite', label: 'Off-site Locations' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setEnvironmentAvailability(prev => ({
                            ...prev,
                            settings: prev.settings.includes(opt.value)
                              ? prev.settings.filter(s => s !== opt.value)
                              : [...prev.settings, opt.value]
                          }))
                        }}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          environmentAvailability.settings.includes(opt.value)
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Can Feature Customers */}
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">Can You Feature Customers?</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEnvironmentAvailability(prev => ({ ...prev, can_feature_customers: true }))}
                      className={`px-4 py-2 text-sm rounded-lg transition-all ${
                        environmentAvailability.can_feature_customers === true
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setEnvironmentAvailability(prev => ({ ...prev, can_feature_customers: false }))}
                      className={`px-4 py-2 text-sm rounded-lg transition-all ${
                        environmentAvailability.can_feature_customers === false
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Space Available */}
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">Space Available</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'minimal', label: 'Tight' },
                      { value: 'moderate', label: 'Moderate' },
                      { value: 'spacious', label: 'Spacious' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setEnvironmentAvailability(prev => ({ ...prev, space: opt.value }))}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          environmentAvailability.space === opt.value
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* NEW v1.1: Aspiration Level */}
            <Card>
              <h3 className="text-lg font-semibold text-white mb-4">Content Quality Goals</h3>
              <p className="text-sm text-gray-400 mb-4">What kind of content are you looking for?</p>
              
              <div className="space-y-4">
                {[
                  { 
                    value: 'match_current', 
                    label: 'Match My Current Level', 
                    description: 'Show me content similar to what I already make'
                  },
                  { 
                    value: 'level_up', 
                    label: 'Help Me Level Up', 
                    description: 'Show me content slightly better than what I make now'
                  },
                  { 
                    value: 'aspirational', 
                    label: 'Show Me Aspirational Examples', 
                    description: 'Show me high-quality content for inspiration'
                  }
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAmbitionLevel(opt.value)}
                    className={`w-full text-left p-4 rounded-lg transition-all ${
                      ambitionLevel === opt.value
                        ? 'bg-purple-600/30 border-2 border-purple-500'
                        : 'bg-gray-800 border-2 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="font-medium text-white">{opt.label}</div>
                    <div className="text-sm text-gray-400">{opt.description}</div>
                  </button>
                ))}
              </div>
            </Card>

            {/* NEW v1.1: Target Audience Builder */}
            <Card>
              <h3 className="text-lg font-semibold text-white mb-4">Who Is Your Customer?</h3>
              <p className="text-sm text-gray-400 mb-4">Help us find content that resonates with your target audience.</p>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Primary Age */}
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">Primary Age Group</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'gen_z', label: 'Gen Z (18-25)' },
                      { value: 'millennial', label: 'Millennial' },
                      { value: 'gen_x', label: 'Gen X' },
                      { value: 'boomer', label: 'Boomer' },
                      { value: 'broad', label: 'Broad Appeal' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setTargetAudiencePrefs(prev => ({ ...prev, primary_age: opt.value }))}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          targetAudiencePrefs.primary_age === opt.value
                            ? 'bg-pink-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Income Level */}
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">Income Level</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'budget', label: 'Budget' },
                      { value: 'mid_range', label: 'Mid-Range' },
                      { value: 'upscale', label: 'Upscale' },
                      { value: 'luxury', label: 'Luxury' },
                      { value: 'broad', label: 'Broad' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setTargetAudiencePrefs(prev => ({ ...prev, income_level: opt.value }))}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          targetAudiencePrefs.income_level === opt.value
                            ? 'bg-pink-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lifestyle Tags */}
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-300 block mb-2">Lifestyle Tags (select all that apply)</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'foodies', label: 'Foodies' },
                      { value: 'families', label: 'Families' },
                      { value: 'date_night', label: 'Date Night' },
                      { value: 'business', label: 'Business' },
                      { value: 'tourists', label: 'Tourists' },
                      { value: 'locals', label: 'Locals' },
                      { value: 'health_conscious', label: 'Health Conscious' },
                      { value: 'indulgent', label: 'Indulgent' },
                      { value: 'social_media_active', label: 'Social Media' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setTargetAudiencePrefs(prev => ({
                            ...prev,
                            lifestyle_tags: prev.lifestyle_tags.includes(opt.value)
                              ? prev.lifestyle_tags.filter(t => t !== opt.value)
                              : [...prev.lifestyle_tags, opt.value]
                          }))
                        }}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          targetAudiencePrefs.lifestyle_tags.includes(opt.value)
                            ? 'bg-pink-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vibe */}
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-300 block mb-2">Brand Vibe</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'trendy', label: 'Trendy' },
                      { value: 'classic', label: 'Classic' },
                      { value: 'family_friendly', label: 'Family Friendly' },
                      { value: 'upscale_casual', label: 'Upscale Casual' },
                      { value: 'dive_authentic', label: 'Dive/Authentic' },
                      { value: 'instagram_worthy', label: 'Instagram Worthy' },
                      { value: 'neighborhood_gem', label: 'Neighborhood Gem' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setTargetAudiencePrefs(prev => ({ ...prev, vibe: opt.value }))}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          targetAudiencePrefs.vibe === opt.value
                            ? 'bg-pink-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* NEW v1.1: Risk Tolerance */}
            <Card>
              <h3 className="text-lg font-semibold text-white mb-4">Content Risk Tolerance</h3>
              <p className="text-sm text-gray-400 mb-4">How edgy can your content be?</p>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Content Edge */}
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">Content Edge</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'brand_safe', label: 'Brand Safe Only' },
                      { value: 'mildly_edgy', label: 'Mildly Edgy OK' },
                      { value: 'edgy', label: 'Edgy OK' },
                      { value: 'provocative', label: 'Provocative OK' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setRiskTolerance(prev => ({ ...prev, content_edge: opt.value }))}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          riskTolerance.content_edge === opt.value
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Humor Risk */}
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">Humor Style</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'safe_humor', label: 'Safe/Clean' },
                      { value: 'playful', label: 'Playful' },
                      { value: 'sarcastic', label: 'Sarcastic' },
                      { value: 'dark_humor', label: 'Dark Humor' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setRiskTolerance(prev => ({ ...prev, humor_risk: opt.value }))}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          riskTolerance.humor_risk === opt.value
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Find Matching Videos */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Videos That Match Your Brand</h3>
                <Button
                  onClick={handleFindMatches}
                  disabled={isFindingMatches}
                  size="sm"
                >
                  {isFindingMatches ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Finding...</span>
                    </>
                  ) : matchedVideos.length > 0 ? (
                    'Refresh'
                  ) : (
                    'Find Matches'
                  )}
                </Button>
              </div>

              {matchedVideos.length > 0 ? (
                <div className="space-y-4">
                  {matchedVideos.map((video, idx) => (
                    <div 
                      key={video.id}
                      className="p-4 bg-gray-800/50 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500 text-sm font-bold">#{idx + 1}</span>
                          <div>
                            <div className="text-white font-medium">
                              {video.title || 'Untitled Video'}
                            </div>
                            <div className="text-sm text-gray-400">
                              {video.platform} • {video.quality_tier || 'Unrated'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-purple-400">
                            {Math.round(video.similarity * 100)}%
                          </span>
                          <a
                            href={video.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 text-sm"
                          >
                            View →
                          </a>
                        </div>
                      </div>
                      
                      {/* v1.1: Score breakdown visualization */}
                      {video.score_breakdown && (
                        <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                          <div className="flex flex-col items-center">
                            <div className="w-full bg-gray-700 rounded-full h-1.5 mb-1">
                              <div 
                                className="bg-purple-500 h-1.5 rounded-full" 
                                style={{ width: `${video.score_breakdown.audience_alignment * 100}%` }}
                              />
                            </div>
                            <span className="text-gray-400">Audience</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <div className="w-full bg-gray-700 rounded-full h-1.5 mb-1">
                              <div 
                                className="bg-green-500 h-1.5 rounded-full" 
                                style={{ width: `${video.score_breakdown.tone_match * 100}%` }}
                              />
                            </div>
                            <span className="text-gray-400">Tone</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <div className="w-full bg-gray-700 rounded-full h-1.5 mb-1">
                              <div 
                                className="bg-blue-500 h-1.5 rounded-full" 
                                style={{ width: `${video.score_breakdown.format_appropriateness * 100}%` }}
                              />
                            </div>
                            <span className="text-gray-400">Format</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <div className="w-full bg-gray-700 rounded-full h-1.5 mb-1">
                              <div 
                                className="bg-yellow-500 h-1.5 rounded-full" 
                                style={{ width: `${video.score_breakdown.aspiration_alignment * 100}%` }}
                              />
                            </div>
                            <span className="text-gray-400">Aspiration</span>
                          </div>
                        </div>
                      )}
                      
                      {/* v1.1: Match explanation */}
                      {video.explanation && (
                        <p className="mt-3 text-sm text-gray-400 italic">
                          {video.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center py-8">
                  Click &quot;Find Matches&quot; to discover videos that fit your brand tone
                </p>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
