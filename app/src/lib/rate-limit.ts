/**
 * Simple in-memory rate limiter
 * For production, consider using Redis or Upstash
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  limit: number;      // Max requests
  window: number;     // Time window in seconds
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetIn: number;    // Seconds until reset
}

export function rateLimit(
  identifier: string,
  options: RateLimitOptions = { limit: 10, window: 60 }
): RateLimitResult {
  const now = Date.now();
  const key = identifier;
  const entry = store.get(key);

  // If no entry or window expired, create new entry
  if (!entry || entry.resetTime < now) {
    store.set(key, {
      count: 1,
      resetTime: now + options.window * 1000,
    });
    return {
      success: true,
      remaining: options.limit - 1,
      resetIn: options.window,
    };
  }

  // Increment count
  entry.count++;

  // Check if over limit
  if (entry.count > options.limit) {
    return {
      success: false,
      remaining: 0,
      resetIn: Math.ceil((entry.resetTime - now) / 1000),
    };
  }

  return {
    success: true,
    remaining: options.limit - entry.count,
    resetIn: Math.ceil((entry.resetTime - now) / 1000),
  };
}

/**
 * Get client IP from request headers
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
