# Kör Migration 004: Invoice Tracking

## Fel som är fixat
✅ **Error: column "user_id" does not exist** - Löst!

RLS-policyn försökte referera till `customer_profiles.user_id` som inte finns. Nu använder den bara `user_profile_id` istället.

---

## Instruktioner

### Metod 1: Via Supabase Dashboard (Rekommenderad)

1. **Öppna Supabase SQL Editor:**
   ```
   https://supabase.com/dashboard/project/fllzlpecwwabwgfbnxfu/sql/new
   ```

2. **Kopiera SQL-koden:**
   - Öppna filen: `app/supabase/migrations/004_invoice_tracking.sql`
   - Kopiera HELA innehållet (147 rader)

3. **Klistra in och kör:**
   - Klistra in i SQL Editor
   - Klicka "Run" eller tryck Ctrl+Enter

4. **Verifiera:**
   Du borde se:
   ```
   Success. No rows returned
   ```

---

### Metod 2: Via Supabase MCP (Om autentiserad)

Om du har Supabase MCP konfigurerat med access token:
```bash
# Använd mcp__supabase__apply_migration tool
```

---

### Metod 3: Via psql (Om du har PostgreSQL installerat)

```bash
# Hämta din databas-URL från Supabase Dashboard
# Settings → Database → Connection string (Session mode)

psql "postgresql://postgres:[PASSWORD]@db.fllzlpecwwabwgfbnxfu.supabase.co:5432/postgres" \
  -f app/supabase/migrations/004_invoice_tracking.sql
```

---

## Vad Migrationen Gör

### ✅ Skapar 2 Nya Tabeller:

1. **invoices**
   - Spårar alla Stripe-fakturor
   - Kolumner: invoice_id, customer_id, subscription_id, amount, status, URLs, etc.
   - RLS aktiverad - användare ser sina egna fakturor

2. **stripe_sync_log**
   - Audit log för alla sync-events
   - Används för idempotens (förhindrar dubbelbearbetning)
   - Endast service_role har access

### ✅ Lägger till:
- 9 index för snabba queries
- RLS policies för säkerhet
- Triggers för automatisk updated_at
- Comments för dokumentation

---

## Efter Migrationen

När migrationen är klar, kör:

```bash
# 1. Starta om dev-servern
cd app
npm run dev

# 2. Kontrollera att konfigurationen laddats
# Leta efter loggarna:
# [Stripe Config] Running in test mode
# [Stripe Config] Secret Key: ✓ Set
```

---

## Verifiera Tabellerna

I Supabase Dashboard SQL Editor, kör:

```sql
-- Kontrollera att tabellerna finns
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('invoices', 'stripe_sync_log');

-- Kolla strukturen
\d invoices
\d stripe_sync_log
```

Du borde se båda tabellerna listade.

---

## Troubleshooting

### Problem: "relation already exists"
Detta är OK - tabellerna använder `CREATE TABLE IF NOT EXISTS`.

### Problem: "permission denied"
Du måste vara inloggad med rätt credentials. Kontrollera att du använder service_role key eller är inloggad i Supabase Dashboard.

### Problem: Andra fel
Kopiera felmeddelandet och visa mig det, så fixar jag det!

---

## Nästa Steg Efter Migration

1. ✅ Verifiera att tabellerna finns
2. ✅ Starta om dev-servern
3. ✅ Testa skapa en prenumeration
4. ✅ Kontrollera att fakturor sparas i `invoices`-tabellen
5. ✅ Testa manual synkronisering: `GET /api/stripe/sync-invoices?customer_id=cus_xxx`

---

**Status:** ✅ Migration fixad och redo att köras!
