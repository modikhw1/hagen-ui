import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin', 'content_manager']);

function deriveTikTokHandle(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Handle @handle format
  if (trimmed.startsWith('@')) return trimmed.slice(1).split('/')[0] ?? null;
  // Handle URL format
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('tiktok.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const handlePart = parts.find((p) => p.startsWith('@'));
      if (handlePart) return handlePart.slice(1);
      if (parts[0]) return parts[0].replace('@', '');
    }
  } catch {
    // Not a URL
  }
  // Plain handle
  return trimmed.replace('@', '').split('/')[0] ?? null;
}

// GET /api/admin/tiktok/profile-preview
router.get('/profile-preview', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const input = typeof req.query['input'] === 'string' ? req.query['input'].trim() : '';
    if (!input) {
      res.status(400).json({ error: 'TikTok-profil krävs.' });
      return;
    }

    const handle = deriveTikTokHandle(input);
    if (!handle) {
      res.status(400).json({ error: 'Ogiltig TikTok-profil. Använd en profil-URL eller @handle.' });
      return;
    }

    // Return a basic preview without fetching — the actual fetch requires RapidAPI
    res.json({
      preview: {
        handle,
        profileUrl: `https://www.tiktok.com/@${handle}`,
        displayName: null,
        avatarUrl: null,
        followerCount: null,
        verified: false,
      },
    });
  } catch (err) {
    logger.error(err, 'tiktok profile-preview error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
