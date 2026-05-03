-- Per-admin "last seen" tracker for the operative attention/notifications feed.
-- Used by the bell badge (unread count) and to highlight new rows in the
-- /admin/notifications inbox without losing state across reloads.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_notification_seen (
  admin_id      uuid        NOT NULL,
  surface       text        NOT NULL CHECK (surface IN ('overview', 'notifications')),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_id, surface)
);

CREATE INDEX IF NOT EXISTS admin_notification_seen_admin_idx
  ON public.admin_notification_seen (admin_id);

COMMIT;
