/**
 * Helpers for proxying requests to the Hagen Railway service.
 *
 * Goals:
 *  - Generate a request id per upstream call so logs on api-server and hagen
 *    can be correlated.
 *  - Always log the upstream URL, status code, duration and a body snippet
 *    when the upstream returns a non-2xx response or non-JSON body.
 *  - Map upstream failure modes onto sensible HTTP statuses for clients:
 *      * upstream returned non-JSON / HTML error page  -> 502 Bad Gateway
 *      * upstream timeout / network error              -> 503 Service Unavailable
 *      * upstream returned JSON 5xx                    -> passthrough status,
 *        but body always contains { error, upstream_status, request_id, ... }
 *
 * Letrend (and other clients) used to see a generic "Internt serverfel" with
 * no clue whether hagen was down, returning HTML, or had been redeployed
 * with a renamed route. The helpers below ensure a useful diagnostic always
 * reaches both the logs and the response body.
 */

import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

const REQUEST_ID_HEADER = 'x-letrend-request-id';

/**
 * Sent to Hagen on every request so upstream logs can correlate contract
 * expectations. Hagen does not yet validate this but will be able to once
 * the contract stabilises.
 */
export const HAGEN_CONTRACT_VERSION = 'v1' as const;

export function getHagenBase(): string | null {
  return process.env['HAGEN_BASE_URL']?.trim() || null;
}

export interface ProxyJsonOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Path beginning with `/api/...` that will be appended to HAGEN_BASE_URL. */
  path: string;
  /** JSON body for POST/PATCH/PUT. */
  body?: unknown;
  /** Optional querystring to append. */
  query?: string;
  /** Timeout in ms. Defaults to 15000. */
  timeoutMs?: number;
  /** Tag used in logs to identify the proxy route, eg `letrend.library`. */
  routeTag: string;
}

export interface UpstreamSuccess {
  ok: true;
  status: number;
  data: Record<string, unknown>;
  requestId: string;
}

export interface UpstreamFailure {
  ok: false;
  /** HTTP status the api-server should return to its own client. */
  clientStatus: number;
  /** Body the api-server should return. */
  body: Record<string, unknown>;
  requestId: string;
}

export type UpstreamResult = UpstreamSuccess | UpstreamFailure;

/**
 * Make a JSON request to hagen. Always returns a discriminated result and
 * never throws. Callers either forward `result.data` on success or
 * `result.body` (with `result.clientStatus`) on failure.
 */
export async function fetchHagenJson(opts: ProxyJsonOptions): Promise<UpstreamResult> {
  const requestId = randomUUID();
  const hagenBase = getHagenBase();

  if (!hagenBase) {
    logger.warn({ requestId, route: opts.routeTag }, 'HAGEN_BASE_URL not configured');
    return {
      ok: false,
      clientStatus: 503,
      requestId,
      body: {
        error: 'hagen-not-configured',
        message: 'HAGEN_BASE_URL is not configured on api-server',
        request_id: requestId,
      },
    };
  }

  const url = `${hagenBase}${opts.path}${opts.query ? `?${opts.query}` : ''}`;
  const method = opts.method ?? 'GET';
  const timeoutMs = opts.timeoutMs ?? 15000;
  const startedAt = Date.now();

  let upstream: globalThis.Response;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [REQUEST_ID_HEADER]: requestId,
      'x-hagen-contract-version': HAGEN_CONTRACT_VERSION,
    };

    // Add shared secret header if configured
    const hagenSyncSecret = process.env['HAGEN_SYNC_SECRET'];
    if (hagenSyncSecret) {
      headers['x-hagen-sync-secret'] = hagenSyncSecret;
    }

    upstream = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('TimeoutError') || message.includes('aborted');
    logger.error(
      { requestId, route: opts.routeTag, url, method, durationMs, err: message },
      'hagen upstream network error',
    );
    return {
      ok: false,
      clientStatus: 503,
      requestId,
      body: {
        error: isTimeout ? 'hagen-timeout' : 'hagen-unreachable',
        message: `Hagen upstream ${isTimeout ? 'timed out' : 'unreachable'} after ${durationMs}ms: ${message}`,
        upstream_status: null,
        request_id: requestId,
      },
    };
  }

  const durationMs = Date.now() - startedAt;
  const contentType = upstream.headers.get('content-type') ?? '';
  const rawText = await upstream.text();
  const snippet = rawText.slice(0, 500);

  // Non-JSON upstream -> 502. This is the "HTML error page from Railway"
  // scenario: hagen redeployed, route renamed, Railway 404 page, etc.
  if (!contentType.includes('application/json')) {
    logger.error(
      {
        requestId,
        route: opts.routeTag,
        url,
        method,
        upstream_status: upstream.status,
        contentType,
        durationMs,
        snippet,
      },
      'hagen upstream returned non-JSON',
    );
    return {
      ok: false,
      clientStatus: 502,
      requestId,
      body: {
        error: 'hagen-non-json',
        message: `Hagen returned non-JSON (${upstream.status} ${contentType || 'unknown content-type'})`,
        upstream_status: upstream.status,
        body_snippet: snippet,
        request_id: requestId,
      },
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch (err) {
    logger.error(
      {
        requestId,
        route: opts.routeTag,
        url,
        upstream_status: upstream.status,
        durationMs,
        snippet,
        err: err instanceof Error ? err.message : String(err),
      },
      'hagen upstream JSON parse failed',
    );
    return {
      ok: false,
      clientStatus: 502,
      requestId,
      body: {
        error: 'hagen-invalid-json',
        message: 'Hagen returned malformed JSON',
        upstream_status: upstream.status,
        body_snippet: snippet,
        request_id: requestId,
      },
    };
  }

  if (!upstream.ok) {
    logger.warn(
      {
        requestId,
        route: opts.routeTag,
        url,
        method,
        upstream_status: upstream.status,
        durationMs,
        snippet,
      },
      'hagen upstream returned error status',
    );
    return {
      ok: false,
      clientStatus: upstream.status,
      requestId,
      body: {
        ...parsed,
        upstream_status: upstream.status,
        request_id: requestId,
      },
    };
  }

  logger.debug(
    { requestId, route: opts.routeTag, url, method, upstream_status: upstream.status, durationMs },
    'hagen upstream ok',
  );
  return { ok: true, status: upstream.status, data: parsed, requestId };
}

/**
 * Convenience wrapper that performs the proxy fetch and writes the result
 * directly to the express `Response`. Returns the result for callers that
 * need to inspect the data (eg side effects on success).
 */
export async function proxyHagenJson(
  res: Response,
  opts: ProxyJsonOptions,
): Promise<UpstreamResult> {
  const result = await fetchHagenJson(opts);
  res.setHeader(REQUEST_ID_HEADER, result.requestId);
  if (result.ok) {
    res.status(result.status).json(result.data);
  } else {
    res.status(result.clientStatus).json(result.body);
  }
  return result;
}
