# 🔧 Setup Guide: Fixa Admin-access

## Problem du upplever:
1. ❌ Loggas ut när du trycker på /admin
2. ❌ dev@letrend.se kan inte logga in efter registrering

## Lösning (Steg-för-steg):

### Steg 1: Kör Database Migration

Du behöver köra migration för att lägga till `role`-kolumnen i databasen.

**Alternativ A: Via Supabase Dashboard (Rekommenderad)**

1. Öppna [Supabase Dashboard](https://supabase.com/dashboard)
2. Välj ditt projekt
3. Gå till **SQL Editor** (vänster meny)
4. Klicka **New Query**
5. Kopiera innehållet från: `app/supabase/migrations/006_role_based_access.sql`
6. Klistra in i SQL Editor
7. Klicka **Run** (eller Ctrl+Enter)

**Alternativ B: Via Supabase CLI**

```bash
cd app
npx supabase db push
```

### Steg 2: Sätt din email som admin

Efter migration, kör detta i Supabase SQL Editor:

```sql
-- Sätt din email som admin
UPDATE profiles
SET role = 'admin', is_admin = true
WHERE email = 'modikhw@gmail.com';

-- Om du också vill sätta dev@letrend.se som admin:
UPDATE profiles
SET role = 'admin', is_admin = true
WHERE email = 'dev@letrend.se';

-- Verifiera att det fungerade:
SELECT email, role, is_admin
FROM profiles
WHERE email IN ('modikhw@gmail.com', 'dev@letrend.se');
```

### Steg 3: Logga ut och logga in igen

1. Öppna din app (http://localhost:3000)
2. Klicka **Logga ut** (om inloggad)
3. Logga in med din email
4. Testa att gå till `/admin` - nu ska det fungera! ✅

---

## För att registrera nya användare (dev@letrend.se):

### Problem: Email-bekräftelse krävs

Om du inte får en bekräftelse-email, kan du:

**Option 1: Bekräfta manuellt i Supabase**

1. Gå till Supabase Dashboard
2. Klicka **Authentication** → **Users**
3. Hitta `dev@letrend.se`
4. Klicka på användaren
5. Sätt **Email Confirmed** till `true`
6. Spara

**Option 2: Stäng av email-bekräftelse (endast development)**

1. Gå till Supabase Dashboard
2. Klicka **Authentication** → **Settings**
3. Scrolla ner till **Email Auth**
4. Stäng av **Enable email confirmations**
5. Spara

Nu kan du registrera och logga in direkt utan bekräftelse.

---

## Verifiera att allt fungerar:

```bash
# 1. Kolla att migrationen kördes:
# Gå till Supabase → Database → Tables → profiles
# Du ska se en kolumn "role" med type "user_role"

# 2. Kolla att din användare är admin:
# Kör i SQL Editor:
SELECT email, role, is_admin FROM profiles WHERE email = 'modikhw@gmail.com';
# Ska visa: role = 'admin', is_admin = true

# 3. Testa admin-access:
# - Logga in på http://localhost:3000
# - Gå till http://localhost:3000/admin
# - Om du kommer in utan att loggas ut = SUCCESS! ✅
```

---

## Om du fortfarande har problem:

### Fel 1: "Column 'role' does not exist"

→ **Lösning:** Migration inte kördes. Kör Steg 1 igen.

### Fel 2: Omdirigeras till "/" med error=admin_required

→ **Lösning:** Din användare är inte admin. Kör Steg 2 igen och verifiera:
```sql
SELECT email, role, is_admin FROM profiles WHERE email = 'din-email@example.com';
```

### Fel 3: dev@letrend.se kan inte logga in

→ **Lösning:** Email-bekräftelse krävs. Följ "För att registrera nya användare" ovan.

### Fel 4: Sidan laddas inte / 500 error

→ **Lösning:** Kolla console i browser (F12) och kolla terminalen där `npm run dev` körs.

---

## Snabbt test-script:

```sql
-- Kör detta i Supabase SQL Editor för att verifiera setup:

-- 1. Kolla att role-kolumn finns:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'role';

-- 2. Lista alla användare och deras roller:
SELECT
  email,
  role,
  is_admin,
  created_at
FROM profiles
ORDER BY created_at DESC;

-- 3. Sätt flera användare som admin (om du vill):
UPDATE profiles
SET role = 'admin', is_admin = true
WHERE email IN (
  'modikhw@gmail.com',
  'dev@letrend.se',
  'hej@letrend.se'
);
```

---

## När det fungerar:

Du ska kunna:
- ✅ Logga in med din email
- ✅ Gå till `/admin` utan att loggas ut
- ✅ Se admin dashboard
- ✅ Gå till `/studio` också (admins har access till både admin och studio)

Content Managers (mahmoud@letrend.se) ska kunna:
- ✅ Gå till `/studio`
- ❌ Inte komma åt `/admin` (redirectas med error=access_denied)

---

## Kort om "applicera routes"

När jag sa "applicera withAuth() på routes" menade jag:

**Före** (osäkert):
```typescript
export async function GET(request: NextRequest) {
  // Ingen auth check - vem som helst kan anropa
  const data = await supabase.from('customers').select('*')
  return NextResponse.json(data)
}
```

**Efter** (säkert):
```typescript
import { withAuth } from '@/lib/auth/api-auth'

export const GET = withAuth(
  async (request, user) => {
    // user är validerad och har rätt role
    const data = await supabase.from('customers').select('*')
    return NextResponse.json(data)
  },
  ['admin'] // Endast admins
)
```

Detta är redan gjort för:
- ✅ `/api/admin/customers` (GET, POST)
- ✅ `/api/studio/email/send` (POST)

Men behöver göras för alla andra API routes under `/api/admin/**` och `/api/studio/**`.

Jag kan hjälpa dig göra detta för alla routes när du vill!

---

## Hjälp?

Om något inte fungerar, visa mig:
1. Felmeddelandet (från browser console eller terminal)
2. Vilken email du försöker logga in med
3. Resultatet av SQL-query: `SELECT email, role, is_admin FROM profiles WHERE email = 'din-email'`
