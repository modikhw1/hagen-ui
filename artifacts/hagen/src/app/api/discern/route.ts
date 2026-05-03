/**
 * Discern API - Start a new discernment session
 * 
 * POST /api/discern
 * 
 * Workflow:
 * 1. Receive video URL
 * 2. Fetch metadata from Supadata
 * 3. Run multi-pass Gemini analysis
 * 4. Create discernment session
 * 5. Generate opening message
 * 6. Return session ID and first message
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { createVideoDownloader } from '@/lib/services/video/downloader'
import { createVideoStorageService } from '@/lib/services/video/storage'
import { coreAnalysisPasses } from '@/lib/services/analysis/prompts'
import { 
  generateOpeningMessage, 
  type ConversationContext 
} from '@/lib/services/analysis/conversation'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)

// Supadata API for metadata
const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY!

async function fetchMetadata(videoUrl: string): Promise<any> {
  // Determine platform
  const isTikTok = videoUrl.includes('tiktok.com')
  const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')

  if (isTikTok) {
    const response = await fetch(
      `https://api.supadata.ai/v1/tiktok/video/info?url=${encodeURIComponent(videoUrl)}`,
      {
        headers: { 'x-api-key': SUPADATA_API_KEY }
      }
    )
    if (!response.ok) throw new Error(`Supadata error: ${response.status}`)
    const data = await response.json()
    return { platform: 'tiktok', ...data }
  }

  if (isYouTube) {
    const response = await fetch(
      `https://api.supadata.ai/v1/youtube/video?url=${encodeURIComponent(videoUrl)}`,
      {
        headers: { 'x-api-key': SUPADATA_API_KEY }
      }
    )
    if (!response.ok) throw new Error(`Supadata error: ${response.status}`)
    const data = await response.json()
    return { platform: 'youtube', ...data }
  }

  return { platform: 'unknown' }
}

async function runGeminiAnalysisPasses(fileUri: string, mimeType: string): Promise<Record<string, any>> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })
  const results: Record<string, any> = {}

  // Run each analysis pass
  for (const pass of coreAnalysisPasses) {
    try {
      const result = await model.generateContent([
        {
          fileData: { mimeType, fileUri }
        },
        `${pass.prompt}\n\nReturn your analysis as JSON with key observations, timestamps if relevant, and a summary.`
      ])

      const text = result.response.text()
      
      // Try to parse as JSON, fall back to text
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          results[pass.name] = JSON.parse(jsonMatch[0])
        } else {
          results[pass.name] = { text, summary: text.slice(0, 500) }
        }
      } catch {
        results[pass.name] = { text, summary: text.slice(0, 500) }
      }
    } catch (error) {
      console.error(`Error in ${pass.name} pass:`, error)
      results[pass.name] = { error: 'Analysis failed for this pass' }
    }
  }

  return results
}

async function loadUserContext(userId?: string): Promise<{
  viralKnowledge: any[]
  userDirections: any[]
  userVocabulary: any[]
  focusAreas: any[]
}> {
  // Load viral knowledge (always)
  const { data: viralKnowledge } = await supabase
    .from('viral_knowledge')
    .select('principle, category, explanation')
    .eq('active', true)

  if (!userId) {
    return {
      viralKnowledge: viralKnowledge || [],
      userDirections: [],
      userVocabulary: [],
      focusAreas: []
    }
  }

  // Load user-specific context
  const [directions, vocabulary, focusAreas] = await Promise.all([
    supabase.from('user_directions').select('statement, direction_type, applies_to').eq('user_id', userId),
    supabase.from('user_vocabulary').select('term, definition').eq('user_id', userId),
    supabase.from('focus_areas').select('area, description, importance_weight').eq('user_id', userId).order('importance_weight', { ascending: false })
  ])

  return {
    viralKnowledge: viralKnowledge || [],
    userDirections: directions.data || [],
    userVocabulary: vocabulary.data || [],
    focusAreas: focusAreas.data || []
  }
}

export async function POST(request: Request) {
  try {
    const { videoUrl, userId } = await request.json()

    if (!videoUrl) {
      return NextResponse.json({ error: 'Video URL is required' }, { status: 400 })
    }

    console.log('Starting discernment session for:', videoUrl)

    // Step 1: Fetch metadata
    let metadata: any = {}
    try {
      metadata = await fetchMetadata(videoUrl)
      console.log('Metadata fetched:', metadata.platform)
    } catch (error) {
      console.warn('Metadata fetch failed, continuing:', error)
    }

    // Step 2: Download video for Gemini analysis
    let localPath: string | null = null
    let geminiFileUri: string | null = null
    let geminiAnalysis: Record<string, any> = {}

    try {
      // Download video using yt-dlp
      const downloader = createVideoDownloader()
      const downloadResult = await downloader.downloadWithYtDlp(videoUrl)
      
      if (downloadResult.success && downloadResult.filePath) {
        localPath = downloadResult.filePath
        console.log('Video downloaded to:', localPath)

        // Step 3: Upload to Gemini File API
        const uploadResult = await fileManager.uploadFile(localPath, {
          mimeType: 'video/mp4'
        })
        geminiFileUri = uploadResult.file.uri
        console.log('Uploaded to Gemini:', geminiFileUri)

        // Wait for file to be processed
        let file = await fileManager.getFile(uploadResult.file.name)
        while (file.state === 'PROCESSING') {
          await new Promise(resolve => setTimeout(resolve, 2000))
          file = await fileManager.getFile(uploadResult.file.name)
        }

        if (file.state === 'ACTIVE') {
          // Step 4: Run multi-pass analysis
          geminiAnalysis = await runGeminiAnalysisPasses(file.uri, 'video/mp4')
          console.log('Gemini analysis complete, passes:', Object.keys(geminiAnalysis))
        }
      }
    } catch (error) {
      console.error('Video analysis failed:', error)
      // Continue with metadata-only analysis
    } finally {
      // Cleanup local file
      if (localPath) {
        const fs = await import('fs/promises')
        await fs.unlink(localPath).catch(console.error)
      }
      // Note: Gemini files auto-expire after 48 hours
    }

    // Step 5: Load user context
    const userContext = await loadUserContext(userId)

    // Step 6: Create discernment session (only required columns)
    const { data: session, error: sessionError } = await supabase
      .from('discernment_sessions')
      .insert({
        video_url: videoUrl,
        video_metadata: metadata,
        gemini_analysis: geminiAnalysis,
        status: 'active'
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Failed to create session:', sessionError)
      throw new Error(`Database error: ${sessionError.message}`)
    }

    // Step 7: Build conversation context
    const conversationContext: ConversationContext = {
      sessionId: session.id,
      videoUrl,
      geminiAnalysis,
      metadata,
      viralKnowledge: userContext.viralKnowledge,
      userDirections: userContext.userDirections,
      userVocabulary: userContext.userVocabulary,
      focusAreas: userContext.focusAreas,
      messageHistory: []
    }

    // Step 8: Generate opening message
    const openingMessage = await generateOpeningMessage(conversationContext)

    // Step 9: Store opening message
    await supabase.from('conversation_messages').insert({
      session_id: session.id,
      role: 'assistant',
      content: openingMessage,
      message_index: 0,
      internal_notes: { type: 'opening' }
    })

    return NextResponse.json({
      sessionId: session.id,
      openingMessage,
      analysisPassesCompleted: Object.keys(geminiAnalysis),
      metadata: {
        platform: metadata.platform,
        author: metadata.author?.displayName || metadata.author?.username || 'Unknown',
        title: metadata.title || metadata.description?.slice(0, 50) || 'Video'
      }
    })

  } catch (error) {
    console.error('Discern session error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start discernment session' },
      { status: 500 }
    )
  }
}

// GET - Retrieve session status/summary
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
  }

  const { data: session, error } = await supabase
    .from('discernment_sessions')
    .select(`
      *,
      conversation_messages (
        role,
        content,
        message_index,
        created_at
      )
    `)
    .eq('id', sessionId)
    .order('message_index', { referencedTable: 'conversation_messages', ascending: true })
    .single()

  if (error) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json(session)
}
