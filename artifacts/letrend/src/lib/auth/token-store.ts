let _token: string | null = null;

export function setAuthToken(token: string | null) {
  _token = token;
}

export function getAuthToken(): string | null {
  return _token;
}

if (typeof window !== 'undefined' && !(window as any).__letrendFetchPatched) {
  (window as any).__letrendFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      const isApi =
        url.startsWith('/api/') ||
        url.includes(`${window.location.origin}/api/`);

      if (isApi) {
        const token = _token;
        const nextInit: RequestInit = { ...(init ?? {}) };
        if (nextInit.credentials === undefined) {
          nextInit.credentials = 'include';
        }
        if (token) {
          const headers = new Headers(nextInit.headers ?? (input instanceof Request ? input.headers : undefined));
          if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
            nextInit.headers = headers;
          }
        }
        return originalFetch(input, nextInit);
      }
    } catch {
      // fall through to original fetch on any error
    }
    return originalFetch(input, init);
  };
}
