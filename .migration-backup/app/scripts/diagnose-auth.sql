-- ============================================
-- Diagnostic Script: Kolla auth-status
-- ============================================

-- 1. Kolla om role-kolumn finns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('role', 'is_admin', 'email');

-- 2. Lista alla användare och deras roller
SELECT
    id,
    email,
    role,
    is_admin,
    created_at,
    updated_at
FROM profiles
ORDER BY created_at DESC
LIMIT 20;

-- 3. Kolla specifikt modikhw@gmail.com
SELECT
    id,
    email,
    role,
    is_admin,
    created_at
FROM profiles
WHERE email = 'modikhw@gmail.com';

-- 4. Kolla specifikt dev@letrend.se
SELECT
    id,
    email,
    role,
    is_admin,
    created_at
FROM profiles
WHERE email = 'dev@letrend.se';

-- 5. Kolla auth.users för att se om användare finns i auth-systemet
SELECT
    id,
    email,
    email_confirmed_at,
    created_at,
    last_sign_in_at
FROM auth.users
WHERE email IN ('modikhw@gmail.com', 'dev@letrend.se');
