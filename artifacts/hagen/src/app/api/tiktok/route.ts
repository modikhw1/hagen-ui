import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const SUPADATA_API_URL = 'https://api.supadata.ai'
const TIKTOK_OEMBED_URL = 'https://www.tiktok.com/oembed'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const tiktokVideoSchema = z.object({
  url: z.string().url('Invalid TikTok URL'),
  include_transcript: z.boolean().optional().default(false),
})

// Fallback to TikTok oEmbed (free, no API key, no rate limits)
async function fetchOembedMetadata(url: string) {
  const oembedUrl = `${TIKTOK_OEMBED_URL}?url=${encodeURIComponent(url)}`
  const response = await fetch(oembedUrl)
  
  if (!response.ok) {
    throw new Error(`oEmbed failed: ${response.status}`)
  }
  
  const data = await response.json()
  
  return {
    title: data.title,
    description: data.title,
    author: {
      username: data.author_unique_id || data.author_name,
      displayName: data.author_name,
    },
    media: {
      type: 'video',
      thumbnailUrl: data.thumbnail_url,
    },
    platform: 'tiktok',
    source: 'oembed',
  }
}

// Primary: Supadata (has engagement stats, hashtags, etc.)
async function fetchSupadataMetadata(url: string, apiKey: string) {
  const encodedUrl = encodeURIComponent(url)
  const response = await fetch(`${SUPADATA_API_URL}/v1/metadata?url=${encodedUrl}`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Supadata failed: ${errorText}`)
  }

  const data = await response.json()
  return { ...data, source: 'supadata' }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = tiktokVideoSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: validation.error.errors,
        },
        { status: 400 }
      )
    }

    const { url } = validation.data
    const apiKey = process.env.SUPADATA_API_KEY

    let metadata: any = null
    let metadataSource = 'none'

    // Try Supadata first (has more data), fallback to oEmbed
    if (apiKey) {
      try {
        metadata = await fetchSupadataMetadata(url, apiKey)
        metadataSource = 'supadata'
      } catch (supErr) {
        console.warn('Supadata failed, falling back to oEmbed:', supErr)
      }
    }

    // Fallback to oEmbed (free, unlimited)
    if (!metadata) {
      try {
        metadata = await fetchOembedMetadata(url)
        metadataSource = 'oembed'
      } catch (oembedErr) {
        console.error('oEmbed also failed:', oembedErr)
        return NextResponse.json(
          { success: false, error: 'Failed to fetch video metadata from all sources' },
          { status: 500 }
        )
      }
    }

    // Extract video ID from URL
    const videoIdMatch = url.match(/video\/(\d+)/)
    const videoId = videoIdMatch ? videoIdMatch[1] : `tiktok_${Date.now()}`

    // Save to database
    const { data: savedVideo, error: saveError } = await supabase
      .from('analyzed_videos')
      .upsert({
        platform: 'tiktok',
        video_url: url,
        video_id: videoId,
        metadata: {
          ...metadata,
          title: metadata.title || metadata.description?.slice(0, 100) || videoId,
          thumbnail_url: metadata.media?.thumbnailUrl || metadata.thumbnail || metadata.cover,
        },
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'video_url'
      })
      .select()
      .single()

    if (saveError) {
      console.error('Database save error:', saveError)
    }

    return NextResponse.json({
      success: true,
      saved: !saveError,
      videoId: savedVideo?.id,
      metadataSource,
      data: metadata,
    })
  } catch (error) {
    console.error('TikTok fetch error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch TikTok data',
      },
      { status: 500 }
    )
  }
}
