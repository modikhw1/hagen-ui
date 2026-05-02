-- ============================================
-- Fix Roles: Enkel script för att sätta roller
-- ============================================

-- 1. Sätt modikhw@gmail.com som admin
UPDATE profiles
SET role = 'admin', is_admin = true
WHERE email = 'modikhw@gmail.com';

-- 2. Sätt dev@letrend.se som content_manager
UPDATE profiles
SET role = 'content_manager', is_admin = false
WHERE email = 'dev@letrend.se';

-- 3. Verifiera att det fungerade
SELECT
    email,
    role,
    is_admin,
    created_at
FROM profiles
WHERE email IN ('modikhw@gmail.com', 'dev@letrend.se')
ORDER BY email;

-- Om du inte ser några resultat, betyder det att profiles inte finns än.
-- Då behöver du logga in först för att skapa profilen!
