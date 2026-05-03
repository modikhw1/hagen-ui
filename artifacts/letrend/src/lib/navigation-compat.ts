import { useLocation } from 'wouter';

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
    const [, navigate] = [null, (path: string) => window.history.pushState({}, '', path)] as const;
    const url = `${window.location.pathname}?${newParams.toString()}`;
    window.history.pushState({}, '', url);
  };
  return [params, setParams];
}
