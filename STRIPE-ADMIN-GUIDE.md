# Stripe Admin API - Snabbreferens

**Base URL:** `http://localhost:3000/api/admin/stripe`

---

## Full Onboarding (ett kommando)

```bash
curl -X POST http://localhost:3000/api/admin/stripe \
  -H "Content-Type: application/json" \
  -d '{
    "action": "full-onboard",
    "email": "kontakt@foretag.se",
    "name": "Anna Andersson",
    "company": "Företaget AB",
    "org_number": "559XXX-XXXX",
    "price_sek": 2399,
    "start_date": "2026-01-24",
    "scope_items": ["10 koncept/mån", "Dedikerad kontakt"]
  }'
```

Skapar: Stripe-kund + Subscription + LeTrend-konto + Lösenordslänk

---

## Enskilda Actions

| Action | Beskrivning |
|--------|-------------|
| `create-customer` | Skapa kund |
| `create-agreement` | Skapa subscription |
| `create-one-time-invoice` | Engångsfaktura |
| `send-invoice` | Skicka faktura |
| `get-payment-links` | Hämta alla betalningslänkar |
| `create-user-account` | Skapa LeTrend-konto |
| `cancel-subscription` | Avsluta avtal |

---

## Vanliga kommandon

**Ny kund + avtal:**
```bash
curl -X POST $URL -H "Content-Type: application/json" \
  -d '{"action":"create-agreement","email":"kund@mail.se","price_sek":1999}'
```

**Hämta betalningslänkar:**
```bash
curl -X POST $URL -H "Content-Type: application/json" \
  -d '{"action":"get-payment-links","email":"kund@mail.se"}'
```

**Engångsfaktura:**
```bash
curl -X POST $URL -H "Content-Type: application/json" \
  -d '{"action":"create-one-time-invoice","email":"kund@mail.se","items":[{"description":"Konsultation","amount_sek":2500}]}'
```

**Lista kunder:**
```bash
curl "$URL?action=list-customers"
```

**Kund-detaljer:**
```bash
curl "$URL?action=get-customer&email=kund@mail.se"
```

---

## Publika sidor (för kunder)

| URL | Syfte |
|-----|-------|
| `/pay/[customerId]` | Betalning utan inloggning |
| `/invoice/landing/[invoiceId]` | Faktura via email |
| `/agreement` | Pending avtal (inloggad) |

---

## Stripe Dashboard

- Kunder: https://dashboard.stripe.com/customers
- Subscriptions: https://dashboard.stripe.com/subscriptions
- Fakturor: https://dashboard.stripe.com/invoices
