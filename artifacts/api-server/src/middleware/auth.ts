import type { Request, Response, NextFunction } from 'express';
import { createSupabaseAdmin, createSupabaseUserClient } from '../lib/supabase.js';

export interface AuthUser {
  id: string;
  email: string | null;
  role: string;
  is_admin: boolean;
  admin_roles: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookies = req.cookies as Record<string, string> | undefined;
  if (cookies) {
    for (const [key, value] of Object.entries(cookies)) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token') && value) {
        try {
          const parsed = JSON.parse(decodeURIComponent(value));
          const token = parsed?.access_token ?? parsed?.[0]?.access_token;
          if (typeof token === 'string') return token;
        } catch {
          if (typeof value === 'string' && value.length > 20) return value;
        }
      }
    }
    for (const [key, value] of Object.entries(cookies)) {
      if (
        (key.includes('auth') || key.includes('token') || key.startsWith('sb-')) &&
        typeof value === 'string' &&
        value.length > 20 &&
        !key.endsWith('-code-verifier')
      ) {
        return value;
      }
    }
  }

  return null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: 'Du måste logga in' });
      return;
    }

    const userClient = createSupabaseUserClient(token);
    const { data: { user: authUser }, error } = await userClient.auth.getUser();

    if (error || !authUser) {
      res.status(401).json({ error: 'Sessionen har gått ut' });
      return;
    }

    const admin = createSupabaseAdmin();
    const [profileResult, adminRolesResult] = await Promise.all([
      admin.from('profiles').select('email, is_admin, role').eq('id', authUser.id).maybeSingle(),
      admin.from('admin_user_roles').select('role').eq('user_id', authUser.id),
    ]);

    const profile = profileResult.data;
    const adminRoles = (adminRolesResult.data ?? []).map((r: { role: string }) => r.role);

    req.user = {
      id: authUser.id,
      email: profile?.email ?? authUser.email ?? null,
      role: (profile?.role as string) ?? 'user',
      is_admin: Boolean(profile?.is_admin),
      admin_roles: adminRoles,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Inte autentiserad' });
      return;
    }
    const allowed = roles.includes(req.user.role) || req.user.is_admin;
    if (!allowed) {
      res.status(403).json({ error: 'Åtkomst nekad' });
      return;
    }
    next();
  };
}
