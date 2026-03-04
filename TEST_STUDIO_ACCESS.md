# Test Studio Access för dev@letrend.se

## Steg 1: Rensa gamla cookies och logga in igen

Eftersom vi har ändrat hur Supabase-klienten hanterar cookies (från localStorage till cookie-baserad autentisering), behöver du logga ut och logga in igen för att få nya cookies i rätt format.

### I din webbläsare (incognito/privat läge rekommenderas):

1. **Öppna DevTools** (F12)
2. **Gå till Application/Storage tab**
3. **Rensa alla cookies** för localhost:3000
4. **Gå till** http://localhost:3000
5. **Logga in som dev@letrend.se**

## Steg 2: Testa olika routes

### Test 1: Studio access (bör fungera ✅)
**URL:** http://localhost:3000/studio

**Förväntat resultat:**
- Du kommer åt Studio dashboard
- Ingen redirect till login eller error-meddelande

### Test 2: Admin access (bör blockeras ❌)
**URL:** http://localhost:3000/admin

**Förväntat resultat:**
- Redirect till `/?error=admin_required`
- Meddelande: "Du har inte behörighet att se denna sida"

### Test 3: Studio API (bör fungera ✅)
**Öppna DevTools Console och kör:**
```javascript
fetch('/api/studio/email/history')
  .then(r => r.json())
  .then(console.log)
```

**Förväntat resultat:**
- HTTP 200
- JSON response med `{ history: [...] }`

### Test 4: Admin API (bör blockeras ❌)
**Öppna DevTools Console och kör:**
```javascript
fetch('/api/admin/customers')
  .then(r => r.json())
  .then(console.log)
```

**Förväntat resultat:**
- HTTP 403
- JSON response med `{ error: 'Insufficient permissions' }`

## Steg 3: Verifiera middleware logs

Kolla i server logs (där dev servern körs) när du besöker routes. Du bör se:

```
[Middleware] Protected route: /studio
[Middleware] Cookies: ['sb-<project>-auth-token-0', 'sb-<project>-auth-token-1', ...]
[Middleware] Session check: {
  hasSession: true,
  userId: '<uuid>',
  email: 'dev@letrend.se',
  ...
}
[Middleware] Profile fetch: {
  hasProfile: true,
  email: 'dev@letrend.se',
  isAdmin: false,
  role: 'content_manager'
}
[Middleware] Determined role: content_manager
```

## Steg 4: Test för modikhw@gmail.com (admin)

Logga ut och logga in som modikhw@gmail.com. Testa:

### Test 1: Admin access (bör fungera ✅)
**URL:** http://localhost:3000/admin

**Förväntat resultat:**
- Du kommer åt Admin dashboard
- Ser kundinformation och statistik

### Test 2: Studio access (bör fungera ✅)
**URL:** http://localhost:3000/studio

**Förväntat resultat:**
- Du kommer åt Studio dashboard (admin har full access)

### Test 3: Admin API (bör fungera ✅)
```javascript
fetch('/api/admin/customers')
  .then(r => r.json())
  .then(data => console.log('Customers:', data.profiles?.length))
```

**Förväntat resultat:**
- HTTP 200
- Lista med customer profiles

## Troubleshooting

### Problem: Middleware ser inga cookies
**Symptom:** `[Middleware] Cookies: []`

**Lösning:**
1. Rensa ALLA cookies för localhost:3000
2. Starta om dev servern
3. Logga in igen

### Problem: Session läses inte korrekt
**Symptom:** `hasSession: false` trots att du är inloggad

**Lösning:**
1. Kontrollera att `app/src/lib/supabase/client.ts` använder `createBrowserClient` från `@supabase/ssr`
2. Kontrollera att middleware använder `createServerClient` från `@supabase/ssr`
3. Rensa cookies och logga in igen

### Problem: 403 Forbidden på alla routes
**Symptom:** Alla API calls ger 403

**Lösning:**
1. Verifiera att användarens `role` är korrekt i databasen:
   ```sql
   SELECT email, role, is_admin FROM profiles WHERE email IN ('dev@letrend.se', 'modikhw@gmail.com');
   ```
2. Om `role` är NULL, kör:
   ```sql
   UPDATE profiles SET role = 'content_manager' WHERE email = 'dev@letrend.se';
   UPDATE profiles SET role = 'admin' WHERE email = 'modikhw@gmail.com';
   ```

## Sammanfattning av förväntade resultat

| User | Route | Resultat |
|------|-------|----------|
| dev@letrend.se | /studio | ✅ Access |
| dev@letrend.se | /admin | ❌ Blockerad |
| dev@letrend.se | /api/studio/* | ✅ Access |
| dev@letrend.se | /api/admin/* | ❌ 403 |
| modikhw@gmail.com | /studio | ✅ Access |
| modikhw@gmail.com | /admin | ✅ Access |
| modikhw@gmail.com | /api/studio/* | ✅ Access |
| modikhw@gmail.com | /api/admin/* | ✅ Access |
