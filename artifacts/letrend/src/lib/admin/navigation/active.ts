export type RouteMatcherItem = {
  href: string;
  exact?: boolean;
  matchers?: readonly string[];
};

export function isRouteActive(pathname: string, item: RouteMatcherItem) {
  if (item.exact) {
    return pathname === item.href;
  }

  if (pathname.startsWith(item.href)) {
    return true;
  }

  return (item.matchers ?? []).some((matcher) => pathname.startsWith(matcher));
}
