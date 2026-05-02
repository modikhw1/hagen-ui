-- ============================================
-- Quick Setup Script: Sätt din användare som admin
-- ============================================
-- Kör detta i Supabase SQL Editor efter du har kört migration 006

-- 1. Lägg till role-kolumn om den inte finns (del av migration 006)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- 2. Sätt din email som admin
-- OBS: Byt ut 'din-email@example.com' till din faktiska email!
UPDATE profiles
SET role = 'admin', is_admin = true
WHERE email = 'modikhw@gmail.com';

-- Om du vill lägga till fler admins:
UPDATE profiles
SET role = 'admin', is_admin = true
WHERE email IN ('dev@letrend.se', 'hej@letrend.se');

-- 3. Sätt content managers
UPDATE profiles
SET role = 'content_manager'
WHERE email IN ('mahmoud@letrend.se');

-- 4. Verifiera att det fungerade
SELECT email, role, is_admin, created_at
FROM profiles
ORDER BY created_at DESC;
