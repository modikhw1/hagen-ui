# Data Model

Beskriv vad du behöver på vanlig svenska. Claude tolkar och skapar migrations.

---

## Profil (Företag)

En användare = ett företag/varumärke.

### Grundinfo
- **Email** - inloggning, unikt
- **Företagsnamn** - "Marias Café"
- **Beskrivning** - kort text om verksamheten

### Sociala kanaler
- **TikTok** - @handle + följare + snittvisningar
- **Instagram** - @handle + följare
- (fler kan läggas till)

### Profilbild
- URL till bild (eller generera från initial)

### Varumärkesprofil (för matchning)
- **Ton** - hur de kommunicerar: "lugn", "lekfull", "professionell"
- **Energinivå** - "avslappnad", "balanserad", "hög"
- **Bransch** - "restaurang", "café", "butik", "tjänst"

### Internt (system, visas ej)
- Admin-flagga
- Stripe-koppling
- Har koncept tilldelade

---

## Koncept (Clip)

En video/idé som kan tilldelas till en profil.

**Identifieras av:** clip_id (text)

**Koppling till profil:**
- Vilken användare äger den
- Vem tilldelade den
- När tilldelades den
- Är den upplåst?
- Anteckningar

---

## Invite

Förinställd inbjudan som admin skapar innan kunden registrerar sig.

**Innehåller:**
- Email (vem den är till)
- Företagsinfo som ska kopieras till profilen
- Vilka koncept som ska tilldelas
- Prenumerationstyp
- Utgångsdatum

---

## Ändringslogg

| Datum | Ändring | Status |
|-------|---------|--------|
| 2026-01-28 | Skapa SCHEMA.md | Klar |
| 2026-01-28 | Slå ihop sociala länkar till `social_links` jsonb | Klar |
| 2026-01-28 | Slå ihop matchning-data till `matching_data` jsonb | Klar |
| 2026-01-28 | Lägg till `tone`, `energy`, `industry`, `avatar_url` | Klar |

---

## To-do (senare)

- [ ] Hämta följare/visningar live från TikTok API
- [ ] Profilbild-uppladdning i UI

---

## Hur du använder detta

1. Beskriv vad du vill ändra i vanlig text, t.ex:
   - "Profiler behöver kunna ha en YouTube-länk"
   - "Jag vill spara vilken typ av mat en restaurang serverar"
   - "Ta bort goals, vi använder inte det"

2. Claude läser detta + databasen och skapar rätt migration

3. Uppdatera ändringsloggen när det är klart
