import type { MetadataProvider, VideoMetadata } from '../types'

export class SupadataMetadataProvider implements MetadataProvider {
  name = 'supadata'
  private apiKey: string
  private baseUrl = 'https://api.supadata.ai/v1'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async fetchMetadata(url: string): Promise<VideoMetadata> {
    const encodedUrl = encodeURIComponent(url)
    const metadataUrl = `${this.baseUrl}/metadata?url=${encodedUrl}`

    try {
      const response = await fetch(metadataUrl, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(`Supadata API error: ${response.status} - ${JSON.stringify(error)}`)
      }

      const data = await response.json()
      
      return this.transformToStandardFormat(data)
    } catch (error) {
      console.error('Supadata metadata fetch failed:', error)
      throw error
    }
  }

  private transformToStandardFormat(data: any): VideoMetadata {
    return {
      provider: this.name,
      platform: data.platform,
      videoId: data.id,
      url: data.url,
      
      title: data.title,
      description: data.description,
      
      author: {
        username: data.author?.username || '',
        displayName: data.author?.displayName || '',
        avatarUrl: data.author?.avatarUrl,
        verified: data.author?.verified,
        followerCount: data.additionalData?.followerCount
      },
      
      stats: {
        views: data.stats?.views,
        likes: data.stats?.likes,
        comments: data.stats?.comments,
        shares: data.stats?.shares
      },
      
      media: {
        type: data.type,
        duration: data.media?.duration,
        thumbnailUrl: data.media?.thumbnailUrl
      },
      
      tags: data.tags || [],
      createdAt: data.createdAt,
      
      additionalData: data.additionalData,
      rawResponse: data
    }
  }
}

export function createSupadataProvider(apiKey?: string): SupadataMetadataProvider {
  const key = apiKey || process.env.SUPADATA_API_KEY
  if (!key) {
    throw new Error('Supadata API key not provided')
  }
  return new SupadataMetadataProvider(key)
}
