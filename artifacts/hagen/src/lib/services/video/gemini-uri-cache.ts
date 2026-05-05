/**
 * In-process cache for Gemini File API URIs.
 *
 * Gemini File API files are valid for 48 h from upload.  We cache for 47 h so
 * we always retire entries before the upstream file expires.  Re-analysing the
 * same URL within the cache window skips the download + re-upload entirely.
 *
 * The cache is module-level so it survives across requests within the same
 * Next.js server process.  On a cold start it starts empty — the first call
 * for a given URL still pays the full cost, every subsequent call within the
 * TTL window is free.
 */

const CACHE_TTL_MS = 47 * 60 * 60 * 1000 // 47 hours

interface CacheEntry {
  geminiUri: string
  expiresAt: number // Date.now() + TTL
}

const cache = new Map<string, CacheEntry>()

/** Return a still-valid Gemini URI for `videoUrl`, or `null` if none. */
export function getCachedGeminiUri(videoUrl: string): string | null {
  const entry = cache.get(videoUrl)
  if (!entry) return null
  if (Date.now() >= entry.expiresAt) {
    cache.delete(videoUrl)
    return null
  }
  return entry.geminiUri
}

/** Store a freshly uploaded Gemini URI for `videoUrl`. */
export function setCachedGeminiUri(videoUrl: string, geminiUri: string): void {
  cache.set(videoUrl, {
    geminiUri,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

/** Evict all expired entries (call periodically to avoid unbounded growth). */
export function evictExpiredEntries(): void {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now >= entry.expiresAt) cache.delete(key)
  }
}

/** Number of entries currently held (for logging / diagnostics). */
export function cacheSize(): number {
  return cache.size
}
