/**
 * Client-Side Caching Utilities
 *
 * Provides session storage based caching with TTL support
 * for client-side data fetching optimization.
 */

type CacheValue = unknown;

interface ClientCacheEntry<T = CacheValue> {
  value: T;
  updatedAt: number;
  expiresAt: number;
}

interface ReadCacheOptions {
  allowExpired?: boolean;
  maxStaleMs?: number;
}

interface FetchCacheOptions {
  force?: boolean;
}

const STORAGE_PREFIX = 'letrend:client-cache:';
const cacheStore = new Map<string, ClientCacheEntry>();
const inflightStore = new Map<string, Promise<CacheValue>>;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readFromSessionStorage<T>(key: string): ClientCacheEntry<T> | null {
  if (!isBrowser()) return null;

  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as ClientCacheEntry<T>;
  } catch {
    return null;
  }
}

function writeToSessionStorage<T>(key: string, entry: ClientCacheEntry<T>): void {
  if (!isBrowser()) return;

  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // Ignore storage quota / serialization errors in client cache.
  }
}

function deleteFromSessionStorage(key: string): void {
  if (!isBrowser()) return;

  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    // Ignore cleanup errors.
  }
}

/**
 * Read a value from client cache
 * @param key - Cache key
 * @param options - Read options (allowExpired, maxStaleMs)
 * @returns Cached entry or null if not found/expired
 */
export function readClientCache<T>(key: string, options: ReadCacheOptions = {}): ClientCacheEntry<T> | null {
  const now = Date.now();
  const { allowExpired = false, maxStaleMs } = options;

  let entry = cacheStore.get(key) as ClientCacheEntry<T> | undefined;
  if (!entry) {
    const fromSession = readFromSessionStorage<T>(key);
    if (fromSession) {
      cacheStore.set(key, fromSession);
      entry = fromSession;
    }
  }

  if (!entry) return null;

  const isFresh = entry.expiresAt > now;
  const isWithinMaxStale = maxStaleMs === undefined || now - entry.updatedAt <= maxStaleMs;

  if (isFresh) return entry;
  if (allowExpired && isWithinMaxStale) return entry;

  cacheStore.delete(key);
  deleteFromSessionStorage(key);
  return null;
}

/**
 * Write a value to client cache
 * @param key - Cache key
 * @param value - Value to cache
 * @param ttlMs - Time to live in milliseconds
 */
export function writeClientCache<T>(key: string, value: T, ttlMs: number): ClientCacheEntry<T> {
  const now = Date.now();
  const entry: ClientCacheEntry<T> = {
    value,
    updatedAt: now,
    expiresAt: now + ttlMs
  };

  cacheStore.set(key, entry);
  writeToSessionStorage(key, entry);

  return entry;
}

/**
 * Clear a specific cache entry
 * @param key - Cache key to clear
 */
export function clearClientCache(key: string): void {
  cacheStore.delete(key);
  inflightStore.delete(key);
  deleteFromSessionStorage(key);
}

/**
 * Fetch data with caching support
 * @param key - Cache key
 * @param fetcher - Async function to fetch data
 * @param ttlMs - Cache TTL in milliseconds
 * @param options - Fetch options (force refresh)
 */
export async function fetchAndCacheClient<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
  options: FetchCacheOptions = {}
): Promise<T> {
  const { force = false } = options;

  if (!force) {
    const cached = readClientCache<T>(key);
    if (cached) {
      return cached.value;
    }
  }

  if (!force) {
    const inflight = inflightStore.get(key);
    if (inflight) {
      return inflight as Promise<T>;
    }
  }

  const request = fetcher()
    .then((value) => {
      writeClientCache(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inflightStore.delete(key);
    });

  inflightStore.set(key, request as Promise<CacheValue>);
  return request;
}
