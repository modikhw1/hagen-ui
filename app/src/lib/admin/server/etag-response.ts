import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';

type CachedJsonResponseArgs = {
  request: NextRequest;
  payload: unknown;
  cacheControl: string;
  cacheTag: string;
  dbMs: number;
  totalMs: number;
  headers?: Record<string, string>;
};

function serverTimingHeader(dbMs: number, totalMs: number) {
  return `db;dur=${dbMs}, total;dur=${totalMs}`;
}

export function cachedJsonResponse(args: CachedJsonResponseArgs) {
  const body = JSON.stringify(args.payload);
  const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
  const baseHeaders = {
    'Cache-Control': args.cacheControl,
    'Cache-Tag': args.cacheTag,
    ETag: etag,
    'Server-Timing': serverTimingHeader(args.dbMs, args.totalMs),
    ...args.headers,
  };

  if (args.request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: baseHeaders,
    });
  }

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...baseHeaders,
    },
  });
}
