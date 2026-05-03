import type { MetricsCalculator, VideoMetadata, VideoAnalysis } from '../types'

export class DefaultMetricsCalculator implements MetricsCalculator {
  name = 'default-calculator'

  calculateMetrics(video: {
    metadata: VideoMetadata
    analysis?: VideoAnalysis
  }): Record<string, number> {
    const metrics: Record<string, number> = {}

    // Engagement rate (likes relative to views)
    if (video.metadata.stats.views && video.metadata.stats.likes) {
      metrics.engagement_rate = (video.metadata.stats.likes / video.metadata.stats.views) * 100
    }

    // Viral coefficient (engagement + shares)
    if (video.metadata.stats.likes && video.metadata.stats.shares && video.metadata.stats.views) {
      const likeRate = video.metadata.stats.likes / video.metadata.stats.views
      const shareRate = video.metadata.stats.shares / video.metadata.stats.views
      metrics.viral_coefficient = (likeRate + shareRate * 2) * 100 // Shares weighted 2x
    }

    // Freshness score (newer = higher score)
    const ageInDays = (Date.now() - new Date(video.metadata.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    metrics.freshness_score = Math.max(0, 100 - ageInDays) // Decays from 100 to 0 over 100 days

    // Comment rate
    if (video.metadata.stats.views && video.metadata.stats.comments) {
      metrics.comment_rate = (video.metadata.stats.comments / video.metadata.stats.views) * 100
    }

    // Relative performance (compared to author's follower count)
    if (video.metadata.author.followerCount && video.metadata.stats.views) {
      metrics.relative_performance = (video.metadata.stats.views / video.metadata.author.followerCount) * 100
    }

    // Analysis-based metrics
    if (video.analysis) {
      // Visual quality score
      if (video.analysis.visual?.overallQuality) {
        metrics.visual_quality = video.analysis.visual.overallQuality * 100
      }

      // Audio quality score
      if (video.analysis.audio?.audioQuality) {
        metrics.audio_quality = video.analysis.audio.audioQuality * 100
      }

      // Hook strength (average of all hooks)
      if (video.analysis.content?.hooks && video.analysis.content.hooks.length > 0) {
        const avgHookStrength = video.analysis.content.hooks.reduce((sum, hook) => sum + hook.strength, 0) / video.analysis.content.hooks.length
        metrics.hook_strength = avgHookStrength * 100
      }

      // Pacing score (based on cut frequency)
      if (video.analysis.technical?.cutFrequency) {
        // Optimal is around 10-20 cuts per minute
        const optimal = 15
        const diff = Math.abs(video.analysis.technical.cutFrequency - optimal)
        metrics.pacing_score = Math.max(0, 100 - (diff * 5))
      }

      // Color diversity
      if (video.analysis.visual?.colorPalette) {
        metrics.color_diversity = Math.min(100, video.analysis.visual.colorPalette.length * 20)
      }

      // Energy level (from audio)
      if (video.analysis.audio?.musicEnergy) {
        metrics.audio_energy = video.analysis.audio.musicEnergy * 100
      }
    }

    // Composite viral potential score
    const componentsForViral = [
      metrics.engagement_rate || 0,
      metrics.freshness_score || 0,
      metrics.hook_strength || 0,
      metrics.visual_quality || 0
    ]
    metrics.viral_potential = componentsForViral.reduce((a, b) => a + b, 0) / componentsForViral.length

    return metrics
  }
}

export function createMetricsCalculator(): DefaultMetricsCalculator {
  return new DefaultMetricsCalculator()
}
