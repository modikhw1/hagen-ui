import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createWithAdmin } from '@/lib/admin/with-admin';

function makeRequest(url = 'https://example.com/api/admin/customers/export?q=test') {
  return new NextRequest(url, { method: 'GET' });
}

describe('withAdmin', () => {
  it('returns 401 when session is missing', async () => {
    const log = vi.fn();
    const withAdmin = createWithAdmin({
      getSessionUserId: async () => null,
      checkAdminRole: async () => true,
      now: () => 100,
      log,
    });

    const handler = withAdmin(async () => ({ ok: true }));
    const response = await handler(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Du maste logga in' },
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, user_id: null }),
    );
  });

  it('returns 403 when user is not admin', async () => {
    const withAdmin = createWithAdmin({
      getSessionUserId: async () => 'user-1',
      checkAdminRole: async () => false,
      now: () => 200,
      log: vi.fn(),
    });

    const handler = withAdmin(async () => ({ ok: true }));
    const response = await handler(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Du saknar adminbehorighet' },
    });
  });

  it('returns 500 when the handler throws', async () => {
    const withAdmin = createWithAdmin({
      getSessionUserId: async () => 'user-1',
      checkAdminRole: async () => true,
      now: () => 300,
      log: vi.fn(),
    });

    const handler = withAdmin(async () => {
      throw new Error('boom');
    });
    const response = await handler(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internt serverfel' },
    });
  });

  it('returns 200 with standardized data envelope for validated handlers', async () => {
    const withAdmin = createWithAdmin({
      getSessionUserId: async () => 'user-1',
      checkAdminRole: async () => true,
      now: (() => {
        let tick = 0;
        return () => ++tick * 10;
      })(),
      log: vi.fn(),
    });

    const handler = withAdmin(
      async ({ input, userId }) => ({
        query: input.q,
        actor: userId,
      }),
      {
        input: z.object({
          q: z.string().optional().default(''),
        }),
        output: z.object({
          query: z.string(),
          actor: z.string(),
        }),
      },
    );

    const response = await handler(makeRequest('https://example.com/api/admin/customers/export?q=acme'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: {
        query: 'acme',
        actor: 'user-1',
      },
    });
  });
});
