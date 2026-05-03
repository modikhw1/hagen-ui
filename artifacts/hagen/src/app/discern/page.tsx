'use client'

import { useState, useRef, useEffect } from 'react'
import { Button, Card, Input, LoadingSpinner } from '@/components/ui'

interface Message {
  role: 'user' | 'assistant'
  content: string
  suggestedActions?: SuggestedAction[]
}

interface SuggestedAction {
  type: 'compare' | 'drill_down' | 'add_direction' | 'add_vocabulary' | 'mark_irrelevant' | 'finalize'
  label: string
  data?: any
}

interface SessionInfo {
  sessionId: string
  platform: string
  author: string
  title: string
  analysisPassesCompleted: string[]
}

export default function DiscernPage() {
  const [videoUrl, setVideoUrl] = useState('')
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [synthesis, setSynthesis] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const startSession = async () => {
    if (!videoUrl.trim()) return

    setIsStarting(true)
    setMessages([])
    setSynthesis(null)

    try {
      const response = await fetch('/api/discern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start session')
      }

      const data = await response.json()

      setSessionInfo({
        sessionId: data.sessionId,
        platform: data.metadata.platform,
        author: data.metadata.author,
        title: data.metadata.title,
        analysisPassesCompleted: data.analysisPassesCompleted
      })

      setMessages([{
        role: 'assistant',
        content: data.openingMessage
      }])

    } catch (error) {
      console.error('Start session error:', error)
      setMessages([{
        role: 'assistant',
        content: `Sorry, I couldn't start the analysis. ${error instanceof Error ? error.message : 'Please try again.'}`
      }])
    } finally {
      setIsStarting(false)
    }
  }

  const sendMessage = async (message?: string) => {
    const messageToSend = message || inputValue.trim()
    if (!messageToSend || !sessionInfo) return

    setInputValue('')
    setIsLoading(true)

    // Add user message immediately
    setMessages(prev => [...prev, { role: 'user', content: messageToSend }])

    try {
      const response = await fetch('/api/discern/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionInfo.sessionId,
          message: messageToSend
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send message')
      }

      const data = await response.json()

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        suggestedActions: data.suggestedActions
      }])

    } catch (error) {
      console.error('Send message error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, something went wrong. ${error instanceof Error ? error.message : ''}`
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleFinalize = async () => {
    if (!sessionInfo) return

    setIsLoading(true)
    setMessages(prev => [...prev, {
      role: 'user',
      content: '[Requesting final assessment...]'
    }])

    try {
      const response = await fetch('/api/discern/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionInfo.sessionId,
          action: 'finalize'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to finalize')
      }

      const data = await response.json()
      setSynthesis(data.synthesis)

      // Format the synthesis into a message
      const synthesisMessage = formatSynthesis(data.synthesis)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: synthesisMessage
      }])

    } catch (error) {
      console.error('Finalize error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I couldn't generate the final assessment. ${error instanceof Error ? error.message : ''}`
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleAction = async (action: SuggestedAction) => {
    switch (action.type) {
      case 'finalize':
        await handleFinalize()
        break
      case 'compare':
        setInputValue("I'd like to compare this to another video...")
        break
      case 'add_direction':
        // Could open a modal for structured input
        setInputValue("I want to save this as a rule: ")
        break
      case 'drill_down':
        setInputValue("Tell me more about that specific moment...")
        break
      default:
        console.log('Action:', action)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Video Discernment
          </h1>
          <p className="text-gray-400">
            Analyze videos through conversation. I learn what you value.
          </p>
        </div>

        {/* URL Input */}
        {!sessionInfo && (
          <Card className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">
              Start a new analysis
            </h2>
            <div className="flex gap-4">
              <Input
                placeholder="Paste TikTok or YouTube URL..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="flex-1"
                disabled={isStarting}
              />
              <Button
                onClick={startSession}
                disabled={!videoUrl.trim() || isStarting}
              >
                {isStarting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Analyzing...</span>
                  </>
                ) : (
                  'Analyze'
                )}
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              This will download the video, run multi-pass AI analysis, and start a conversation.
            </p>
          </Card>
        )}

        {/* Session Info */}
        {sessionInfo && (
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className={`px-2 py-1 rounded text-sm ${
                sessionInfo.platform === 'tiktok' 
                  ? 'bg-pink-500/20 text-pink-300' 
                  : 'bg-red-500/20 text-red-300'
              }`}>
                {sessionInfo.platform}
              </span>
              <span className="text-gray-400 text-sm">
                {sessionInfo.author} • {sessionInfo.title}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSessionInfo(null)
                setMessages([])
                setSynthesis(null)
                setVideoUrl('')
              }}
            >
              New Video
            </Button>
          </div>
        )}

        {/* Chat Messages */}
        {messages.length > 0 && (
          <Card className="mb-4 max-h-[500px] overflow-y-auto">
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-100'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    
                    {/* Suggested Actions */}
                    {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-600 flex flex-wrap gap-2">
                        {msg.suggestedActions.map((action, actionIdx) => (
                          <button
                            key={actionIdx}
                            onClick={() => handleAction(action)}
                            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-full text-sm transition-colors"
                          >
                            {action.label}
                          </button>
                        ))}
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

        {/* Input Area */}
        {sessionInfo && !synthesis && (
          <div className="flex gap-2">
            <Input
              placeholder="Share your thoughts about this video..."
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
            <Button
              variant="secondary"
              onClick={handleFinalize}
              disabled={isLoading || messages.length < 3}
              title={messages.length < 3 ? 'Have at least one exchange before finalizing' : 'Get final assessment'}
            >
              Finalize
            </Button>
          </div>
        )}

        {/* Synthesis Complete */}
        {synthesis && (
          <Card className="mt-4 bg-gradient-to-r from-purple-900/50 to-pink-900/50 border-purple-500/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">
                Session Complete ✓
              </h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                synthesis.verdict === 'study' ? 'bg-blue-500/30 text-blue-300' :
                synthesis.verdict === 'replicate' ? 'bg-green-500/30 text-green-300' :
                synthesis.verdict === 'adapt' ? 'bg-yellow-500/30 text-yellow-300' :
                synthesis.verdict === 'reference' ? 'bg-purple-500/30 text-purple-300' :
                'bg-gray-500/30 text-gray-300'
              }`}>
                {synthesis.verdict.toUpperCase()}
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">
                  {synthesis.viralityScore.objective}/10
                </div>
                <div className="text-sm text-gray-400">Objective Quality</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {synthesis.viralityScore.userAlignment}/10
                </div>
                <div className="text-sm text-gray-400">Your Alignment</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">
                  {synthesis.viralityScore.overall}/10
                </div>
                <div className="text-sm text-gray-400">Overall</div>
              </div>
            </div>

            <p className="text-gray-300 mb-4">{synthesis.summary}</p>

            <div className="flex gap-4">
              <Button onClick={() => {
                setSessionInfo(null)
                setMessages([])
                setSynthesis(null)
                setVideoUrl('')
              }}>
                Analyze Another Video
              </Button>
              <Button variant="secondary" onClick={() => {
                // Could navigate to library or history
                console.log('View in library')
              }}>
                View in Library
              </Button>
            </div>
          </Card>
        )}

        {/* Starting Analysis Overlay */}
        {isStarting && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <Card className="max-w-md text-center">
              <LoadingSpinner size="lg" />
              <h3 className="text-xl font-semibold text-white mt-4 mb-2">
                Analyzing Video
              </h3>
              <p className="text-gray-400">
                Downloading video, running AI analysis passes...
              </p>
              <p className="text-gray-500 text-sm mt-2">
                This may take 30-60 seconds
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function formatSynthesis(synthesis: any): string {
  const parts: string[] = []
  
  parts.push(`## Final Assessment\n`)
  parts.push(synthesis.summary)
  parts.push(`\n**Verdict: ${synthesis.verdict.toUpperCase()}**\n${synthesis.verdictReasoning}`)
  
  parts.push(`\n**Scores:**`)
  parts.push(`• Objective Quality: ${synthesis.viralityScore.objective}/10`)
  parts.push(`• Alignment with Your Preferences: ${synthesis.viralityScore.userAlignment}/10`)
  parts.push(`• Overall: ${synthesis.viralityScore.overall}/10 (${synthesis.viralityScore.confidence} confidence)`)
  
  if (synthesis.keyTakeaways?.length > 0) {
    parts.push(`\n**Key Takeaways:**`)
    synthesis.keyTakeaways.forEach((t: string) => parts.push(`• ${t}`))
  }
  
  if (synthesis.userLearnings?.length > 0) {
    parts.push(`\n**What I learned about your preferences:**`)
    synthesis.userLearnings.forEach((l: string) => parts.push(`• ${l}`))
  }
  
  return parts.join('\n')
}
