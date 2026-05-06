// ─────────────────────────────────────────────────────────────────────────────
// Route registration smoke test for reconciliation-candidates endpoints.
//
// Verifies that all 4 endpoints are registered on the studio-v2 router at
// module load time — i.e. they are NOT nested inside another route handler.
//
// This does NOT make real HTTP requests or touch Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

// Import the router. Module-level side effects (router.get / router.post calls)
// execute immediately when the module is evaluated.
import router from '../../routes/studio-v2.js';

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
};

function registeredRoutes(r: typeof router): Array<{ method: string; path: string }> {
  const stack = (r as unknown as { stack: RouteLayer[] }).stack ?? [];
  return stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      method: Object.keys(layer.route!.methods)[0]?.toUpperCase() ?? '',
      path: layer.route!.path as string,
    }));
}

describe('studio-v2 reconciliation-candidates route registration', () => {
  it('registers POST /customers/:customerId/reconciliation-candidates/generate at module level', () => {
    const routes = registeredRoutes(router);
    const found = routes.some(
      (r) => r.method === 'POST' && r.path === '/customers/:customerId/reconciliation-candidates/generate',
    );
    expect(found).toBe(true);
  });

  it('registers GET /customers/:customerId/reconciliation-candidates at module level', () => {
    const routes = registeredRoutes(router);
    const found = routes.some(
      (r) => r.method === 'GET' && r.path === '/customers/:customerId/reconciliation-candidates',
    );
    expect(found).toBe(true);
  });

  it('registers POST /reconciliation-candidates/:candidateId/accept at module level', () => {
    const routes = registeredRoutes(router);
    const found = routes.some(
      (r) => r.method === 'POST' && r.path === '/reconciliation-candidates/:candidateId/accept',
    );
    expect(found).toBe(true);
  });

  it('registers POST /reconciliation-candidates/:candidateId/reject at module level', () => {
    const routes = registeredRoutes(router);
    const found = routes.some(
      (r) => r.method === 'POST' && r.path === '/reconciliation-candidates/:candidateId/reject',
    );
    expect(found).toBe(true);
  });

  it('DELETE /history/reconciliation is registered as a top-level route (not nested)', () => {
    const routes = registeredRoutes(router);
    const found = routes.some(
      (r) => r.method === 'DELETE' && r.path === '/history/reconciliation',
    );
    expect(found).toBe(true);
  });
});
