export const redirect = (url: string) => { window.location.href = url; };
export const permanentRedirect = (url: string) => { window.location.href = url; };
export const notFound = () => { throw new Error('Not found'); };
export const useRouter = () => ({ push: (url: string) => { window.location.href = url; }, replace: (url: string) => { window.location.href = url; }, back: () => window.history.back() });
export const usePathname = () => window.location.pathname;
export const useSearchParams = () => new URLSearchParams(window.location.search);
