# TikTok Lead Scraper

Hittar svenska verksamheter som gör humor-content via network expansion från seed-profiler.

## Setup

```bash
cd scripts/tiktok-leads
npm install
```

## Konfigurera Apify Token

Hämta din token från: https://console.apify.com/account/integrations

```bash
# Windows PowerShell
$env:APIFY_TOKEN = "apify_api_xxxxx"

# Linux/Mac
export APIFY_TOKEN="apify_api_xxxxx"
```

## Användning

### 1. Testa med 3 seeds först (billigare)

```bash
npm run scrape:test
```

### 2. Kör full scrape

```bash
npm run scrape
```

### 3. Filtrera resultat

```bash
npm run filter
```

### Eller kör allt

```bash
npm run all
```

## Output

Resultat sparas i `output/`:

- `raw-network.json` - Alla hittade profiler
- `candidates.json` - Profiler som dyker upp 2+ gånger
- `leads.json` - Filtrerade leads med scoring
- `leads.csv` - För Excel/Google Sheets

## Kriterier

Leads filtreras på:

| Kriterie | Värde |
|----------|-------|
| Följare | 50 - 4000 |
| Land | Sverige (text/städer i bio) |
| Bransch | Mat/restaurang/café/bar |

## Kostnad

Ungefärlig Apify-kostnad:
- Test (3 seeds): ~$0.50
- Full (15 seeds): ~$2-3

## Lägg till fler seeds

Editera `seeds.json`:

```json
{
  "seeds": [
    { "username": "nytt_konto", "notes": "Beskrivning" }
  ]
}
```
