import { useLocation, useParams as useWouterParams } from 'wouter';

export function useRouter() {
  const [, navigate] = useLocation();
  return {
    push: (path: string) => navigate(path),
    replace: (path: string, _opts?: { scroll?: boolean }) => navigate(path),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
    prefetch: () => {},
  };
}

export function useSearchParams(): [URLSearchParams, (params: URLSearchParams) => void] {
  const params = new URLSearchParams(window.location.search);
  const setParams = (newParams: URLSearchParams) => {
    const url = `${window.location.pathname}?${newParams.toString()}`;
    window.history.pushState({}, '', url);
  };
  return [params, setParams];
}

export function usePathname(): string {
  const [location] = useLocation();
  return location;
}

export function useParams<T extends Record<string, string>>(): T {
  return useWouterParams() as T;
}

export function redirect(path: string): never {
  window.location.href = path;
  throw new Error('redirect');
}

export function permanentRedirect(path: string): never {
  window.location.replace(path);
  throw new Error('permanentRedirect');
}

export function notFound(): never {
  throw new Error('notFound');
}
