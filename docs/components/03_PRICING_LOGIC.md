# Component 03: Pricing Logic Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)
> **Component**: Pricing Logic
> **Last Updated**: January 1, 2026

---

## Overview

This document provides exhaustive detail on how concept prices are calculated, including match percentage scoring, purchasing power adjustment, and the cashback system.

---

## 0. Pricing Design Rationale

### Target Price Range

Owner specification: **$20-30 USD** for the US market, with PPP adjustment for other markets.

- **US market**: $20-30 per concept
- **Other markets**: PPP-adjusted (can be lower)
- **Simple model**: Match % drives the $10 variance within the range

### Why These Specific Values?

| Decision | Value | Rationale |
|----------|-------|-----------|
| Base price | $20 USD | Minimum price in US market - feels substantial for a concept |
| Match bonus cap | $10 | Maximum addition for high-match concepts ($20 + $10 = $30) |
| Price floor | $5 | Below this, transaction fees dominate (after PPP) |
| Price ceiling | $100 | Above this, buyers would expect more than a concept |

### Cashback System

The cashback system exists to incentivize buyers to produce content and provide feedback data. It is **de-emphasized in the UI** (footnote level: "Film it → get some back") but the backend logic remains:

```
Cashback mechanics:
- Built into pricing (not a separate premium)
- ~10% of purchase price returned when buyer submits produced content
- Primary purpose: Collect feedback data, not as a sales incentive
- UI treatment: Subtle mention, not a headline feature
```

---

## 1. Pricing Formula

### Complete Formula

```
listed_price = (base_price + (match_percentage / 100 × match_bonus)) × purchasing_power_index
```

### Component Breakdown

| Component | Default Value | Range | Purpose |
|-----------|---------------|-------|---------|
| `base_price` | $20 USD | Fixed | Minimum price in US market |
| `match_percentage` | Model output | 0-100 | How well concept fits buyer's profile |
| `match_bonus` | $10 USD | Fixed | Maximum addition for perfect match |
| `purchasing_power_index` | Market-specific | 0.18-1.0 | Regional affordability |

### Match Percentage

**Match %** is the user-facing metric that replaces the internal virality score. It's a composite score (0-100) combining:

1. **Relative like-ratio** (virality potential)
2. **Easy to replicate** (production feasibility)
3. **Creativity** (uniqueness)
4. **Recency of upload** (freshness)
5. **Cultural reach** (cross-market potential)
6. **Customer fit** (goals/taste alignment) ← Personalization factor

The model outputs match % directly based on the user's profile and the concept's characteristics.

---

## 2. Purchasing Power Parity (PPP) Reference Data

### Source: World Bank International Comparison Program

PPP values based on **2023 World Bank price level indices**, adjusted for digital goods:

| Country | ISO | PPP Index | Rationale |
|---------|-----|-----------|-----------|
| United States | US | 1.00 | Baseline |
| United Kingdom | GB | 0.92 | High income, strong currency |
| Germany | DE | 0.88 | High income EU |
| France | FR | 0.85 | High income EU |
| Spain | ES | 0.70 | Medium-high income EU |
| Mexico | MX | 0.40 | Medium income Americas |
| Brazil | BR | 0.35 | Medium income Americas |
| Indonesia | ID | 0.25 | Large medium income Asia |
| India | IN | 0.22 | Large lower-middle income Asia |
| Philippines | PH | 0.28 | Medium income Asia |
| Vietnam | VN | 0.24 | Lower-middle income Asia |
| Thailand | TH | 0.32 | Upper-middle income Asia |
| Nigeria | NG | 0.18 | Lower-middle income Africa |
| Egypt | EG | 0.20 | Lower-middle income MENA |
| Turkey | TR | 0.30 | Upper-middle income |
| Poland | PL | 0.55 | Medium income EU |
| Colombia | CO | 0.32 | Medium income Americas |
| Argentina | AR | 0.28 | Medium income Americas (volatile) |

### PPP Implementation

```typescript
// Stored in market_contexts table
const marketPPP: Record<string, number> = {
  US: 1.00, GB: 0.92, DE: 0.88, FR: 0.85, ES: 0.70,
  MX: 0.40, BR: 0.35, ID: 0.25, IN: 0.22, PH: 0.28,
  VN: 0.24, TH: 0.32, NG: 0.18, EG: 0.20, TR: 0.30,
  PL: 0.55, CO: 0.32, AR: 0.28
};

// Example: $55 USD concept price in different markets
// US: $55.00 × 1.00 = $55.00
// Mexico: $55.00 × 0.40 = $22.00
// Indonesia: $55.00 × 0.25 = $13.75
// India: $55.00 × 0.22 = $12.10
```

### Why Digital-Adjusted PPP?

Standard PPP is based on physical goods baskets. Digital goods have different considerations:
- No shipping costs
- Same production cost regardless of buyer location
- Local willingness to pay for digital content differs from physical goods

We use **0.8× the standard PPP ratio** for emerging markets to account for:
- Higher digital literacy among target buyers (skews more affluent)
- Content creators often have some disposable income
- Digital content valued more than PPP would suggest in these markets

---

## 3. Implementation

### TypeScript Interface

```typescript
interface PricingConfig {
  // Base configuration
  basePrice: number;           // Default: 20 (USD)
  matchBonus: number;          // Default: 10 (USD)

  // Constraints
  minPrice: number;            // Default: 5.00
  maxPrice: number;            // Default: 100.00
}

interface PricingInput {
  matchPercentage: number;        // 0-100 from model
  purchasingPowerIndex: number;   // From market_contexts
  config?: Partial<PricingConfig>;
}

interface PricingOutput {
  basePrice: number;              // Before PPP ($20 USD)
  matchBonus: number;             // Bonus from match % (up to $10)
  prePPPPrice: number;            // base + bonus ($20-30 USD)
  listedPrice: number;            // After PPP adjustment
  cashbackAmount: number;         // ~10% of listed price
  breakdown: PricingBreakdown;    // Detailed calculation
}

interface PricingBreakdown {
  steps: {
    step: string;
    value: number;
    explanation: string;
  }[];
}
```

### Complete Implementation

```typescript
const DEFAULT_CONFIG: PricingConfig = {
  basePrice: 20,
  matchBonus: 10,
  minPrice: 5.00,
  maxPrice: 100.00
};

function calculatePrice(input: PricingInput): PricingOutput {
  const config = { ...DEFAULT_CONFIG, ...input.config };
  const { matchPercentage, purchasingPowerIndex } = input;

  const steps: PricingBreakdown['steps'] = [];

  // Step 1: Base price
  const basePrice = config.basePrice;
  steps.push({
    step: 'Base Price',
    value: basePrice,
    explanation: `Starting point: $${basePrice.toFixed(2)}`
  });

  // Step 2: Match bonus (0-100% → $0-10)
  const matchBonusAmount = (matchPercentage / 100) * config.matchBonus;
  const prePPPPrice = basePrice + matchBonusAmount;
  steps.push({
    step: 'Match Bonus',
    value: prePPPPrice,
    explanation: `${matchPercentage}% match = +$${matchBonusAmount.toFixed(2)} → $${prePPPPrice.toFixed(2)}`
  });

  // Step 3: PPP adjustment
  const pppAdjusted = prePPPPrice * purchasingPowerIndex;
  steps.push({
    step: 'PPP Adjustment',
    value: pppAdjusted,
    explanation: `$${prePPPPrice.toFixed(2)} × ${purchasingPowerIndex.toFixed(2)} PPP = $${pppAdjusted.toFixed(2)}`
  });

  // Step 4: Clamp to min/max
  const listedPrice = Math.max(
    config.minPrice,
    Math.min(config.maxPrice, Math.round(pppAdjusted * 100) / 100)
  );

  if (listedPrice !== Math.round(pppAdjusted * 100) / 100) {
    steps.push({
      step: 'Price Clamping',
      value: listedPrice,
      explanation: `Clamped to $${config.minPrice}-$${config.maxPrice} range`
    });
  }

  // Calculate cashback (~10% of listed price)
  const cashbackAmount = Math.round(listedPrice * 0.10 * 100) / 100;

  return {
    basePrice,
    matchBonus: matchBonusAmount,
    prePPPPrice,
    listedPrice,
    cashbackAmount,
    breakdown: { steps }
  };
}
```

---

## 3. Example Calculations

### Example 1: High-Match Concept in US Market

```
Input:
  - match_percentage: 94%
  - purchasing_power_index: 1.0 (US)

Calculation:
  1. Base: $20.00
  2. Match bonus: 94% × $10 = $9.40
  3. Pre-PPP: $20 + $9.40 = $29.40
  4. PPP: $29.40 × 1.0 = $29.40

Output:
  - listed_price: $29.40
  - cashback_amount: $2.94
```

### Example 2: Same Concept in Indonesia

```
Input:
  - match_percentage: 94%
  - purchasing_power_index: 0.25 (Indonesia)

Calculation:
  1. Base: $20.00
  2. Match bonus: 94% × $10 = $9.40
  3. Pre-PPP: $29.40
  4. PPP: $29.40 × 0.25 = $7.35

Output:
  - listed_price: $7.35
  - cashback_amount: $0.74
```

### Example 3: Moderate Match in Mexico

```
Input:
  - match_percentage: 72%
  - purchasing_power_index: 0.40 (Mexico)

Calculation:
  1. Base: $20.00
  2. Match bonus: 72% × $10 = $7.20
  3. Pre-PPP: $27.20
  4. PPP: $27.20 × 0.40 = $10.88

Output:
  - listed_price: $10.88
  - cashback_amount: $1.09
```

### Example 4: Lower Match in India

```
Input:
  - match_percentage: 58%
  - purchasing_power_index: 0.22 (India)

Calculation:
  1. Base: $20.00
  2. Match bonus: 58% × $10 = $5.80
  3. Pre-PPP: $25.80
  4. PPP: $25.80 × 0.22 = $5.68

Output:
  - listed_price: $5.68
  - cashback_amount: $0.57
```

---

## 4. Match Percentage Calculation

The match percentage (0-100) comes from the trained preference model combined with user profile data.

### How It's Calculated

```typescript
interface MatchCalculation {
  // Base scores from model
  conceptScore: number;           // Intrinsic quality (0-1)
  profileFitScore: number;        // How well it fits user profile (0-1)

  // Combined
  matchPercentage: number;        // Combined score × 100 (0-100)

  // Explanation (plain language for UI)
  whyItFits: string[];            // Reasons this matches the user
  considerations: string[];       // Things to keep in mind
}

function calculateMatchPercentage(
  features: DeepAnalysis,
  userProfile: UserProfile,
  model: ModelVersion
): MatchCalculation {
  // 1. Calculate intrinsic concept quality (like-ratio, creativity, etc.)
  const conceptScore = calculateConceptScore(features, model);

  // 2. Calculate profile fit (business type, goals, constraints)
  const profileFitScore = calculateProfileFit(features, userProfile);

  // 3. Combine scores (weighted average)
  const combinedScore = (conceptScore * 0.6) + (profileFitScore * 0.4);

  // 4. Generate plain-language explanations
  const whyItFits = generateFitReasons(features, userProfile);
  const considerations = generateConsiderations(features, userProfile);

  return {
    conceptScore,
    profileFitScore,
    matchPercentage: Math.round(combinedScore * 100),
    whyItFits,
    considerations
  };
}
```

### Match Percentage Components

| Component | Weight | Factors |
|-----------|--------|---------|
| Concept Quality | 60% | Like-ratio, creativity, replicability, freshness |
| Profile Fit | 40% | Industry match, resource constraints, goals alignment |

### Example Match Calculation

```
Concept Features:
  - Replicability: High (easy to film)
  - People needed: 1 person
  - Industry: Works for food/retail/service

User Profile:
  - Business: "Coffee shop in Austin"
  - Goal: "More foot traffic"
  - Constraints: "Just me, no budget for actors"

Calculation:
  1. Concept score: 0.82 (high replicability, good engagement)
  2. Profile fit: 0.95 (works for food business, 1 person, local focus)
  3. Combined: (0.82 × 0.6) + (0.95 × 0.4) = 0.492 + 0.38 = 0.872

match_percentage = 87%

Why it fits:
  - "Works great for food businesses"
  - "You can film this yourself"
  - "Perfect for driving local traffic"
```

---

## 5. Purchasing Power Index

### Data Sources

The PPP index can come from:
1. **World Bank Data**: Official PPP conversion factors
2. **Big Mac Index**: Intuitive, updated regularly
3. **Manual Tiers**: Simplified categorization

### Recommended Values (Based on World Bank 2024)

| Market | Country Code | PPP Index | Rationale |
|--------|--------------|-----------|-----------|
| United States | US | 1.00 | Baseline |
| United Kingdom | GB | 0.85 | Slightly lower |
| Germany | DE | 0.90 | Strong economy |
| France | FR | 0.85 | Similar to UK |
| Spain | ES | 0.70 | Lower cost of living |
| Mexico | MX | 0.40 | Emerging market |
| Brazil | BR | 0.35 | Emerging market |
| Indonesia | ID | 0.25 | Large gap |
| Philippines | PH | 0.20 | Similar to Indonesia |
| India | IN | 0.18 | Largest gap |

### Updating PPP Values

```typescript
// Quarterly update recommended
async function updatePPPValues() {
  const worldBankData = await fetch('https://api.worldbank.org/v2/country/all/indicator/PA.NUS.PPP');
  
  // US PPP factor as baseline
  const usPPP = worldBankData.find(d => d.country.id === 'US').value;
  
  for (const country of worldBankData) {
    const pppIndex = country.value / usPPP;
    
    await db.marketContexts.update({
      where: { country_code: country.country.id },
      data: { purchasing_power_index: pppIndex }
    });
  }
}
```

---

## 6. Cashback System (De-emphasized)

The cashback system exists primarily to collect feedback data, not as a marketing feature.

### UI Treatment

- **NOT**: "Get 10% cashback when you film it!"
- **YES**: Small footnote: "Film it → get some back"

The cashback is mentioned subtly because:
1. Main value proposition is the concept, not the rebate
2. Avoids attracting buyers motivated only by cashback
3. Keeps focus on business outcomes, not savings

### How It Works

```
Scenario:
  - Listed price: $25.00
  - Buyer purchases concept
  - Buyer produces content and submits URL
  - Buyer receives ~$2.50 back (10%)

Revenue for platform: $22.50
Data received: Produced content URL for feedback loop
```

### Cashback Expiration

```typescript
const CASHBACK_EXPIRATION_DAYS = 30;

async function checkCashbackExpiration() {
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() - CASHBACK_EXPIRATION_DAYS);

  await db.transactions.updateMany({
    where: {
      cashback_status: 'pending',
      purchased_at: { lt: expirationDate },
      produced_content: null
    },
    data: { cashback_status: 'expired' }
  });
}
```

---

## 8. Price Display Considerations

### Currency Conversion

```typescript
interface DisplayPrice {
  amount: number;
  currency: string;
  formatted: string;
  usdEquivalent: number;
}

async function getDisplayPrice(
  listedPriceUsd: number, 
  marketContext: MarketContext
): Promise<DisplayPrice> {
  const exchangeRate = await getExchangeRate('USD', marketContext.currency_code);
  const localAmount = listedPriceUsd * exchangeRate;
  
  return {
    amount: localAmount,
    currency: marketContext.currency_code,
    formatted: formatCurrency(localAmount, marketContext.currency_code),
    usdEquivalent: listedPriceUsd
  };
}

function formatCurrency(amount: number, currency: string): string {
  const formatters: Record<string, Intl.NumberFormat> = {
    USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    EUR: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
    GBP: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
    IDR: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }),
    BRL: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
    MXN: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }),
    INR: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }),
  };
  
  return formatters[currency]?.format(amount) || `${currency} ${amount.toFixed(2)}`;
}
```

### Example Display Prices

| Market | USD Price | Local Currency | Formatted |
|--------|-----------|----------------|-----------|
| US | $13.30 | $13.30 USD | $13.30 |
| UK | $11.31 | £9.05 GBP | £9.05 |
| Indonesia | $3.33 | 51,500 IDR | Rp 51.500 |
| Brazil | $4.66 | R$23.30 BRL | R$ 23,30 |
| Mexico | $5.32 | $92.00 MXN | $92.00 |
| India | $2.39 | ₹200 INR | ₹200.00 |

---

## 7. Pricing API

### Endpoint: Calculate Price

```typescript
// POST /api/pricing/calculate
interface CalculatePriceRequest {
  concept_id: string;
  user_id: string;        // For profile-based match calculation
  market_id: string;
}

interface CalculatePriceResponse {
  concept_id: string;
  market_id: string;
  match_percentage: number;
  pricing: PricingOutput;
  display: DisplayPrice;
}
```

### Endpoint: Bulk Calculate (for recommendations)

```typescript
// POST /api/pricing/bulk
interface BulkCalculateRequest {
  concept_ids: string[];
  user_id: string;
  market_id: string;
}

interface BulkCalculateResponse {
  results: {
    concept_id: string;
    match_percentage: number;
    listed_price: number;
    display_price: DisplayPrice;
  }[];
}
```

---

## 8. Pricing Analytics

### Track Conversion by Price Point

```typescript
interface PricingAnalytics {
  priceRange: string;         // '$5-10', '$10-20', etc.
  listingCount: number;
  salesCount: number;
  conversionRate: number;
  averageMatchPercent: number;
}

async function getPricingAnalytics(marketId: string): Promise<PricingAnalytics[]> {
  const ranges = [
    { min: 5, max: 10, label: '$5-10' },
    { min: 10, max: 15, label: '$10-15' },
    { min: 15, max: 20, label: '$15-20' },
    { min: 20, max: 25, label: '$20-25' },
    { min: 25, max: 30, label: '$25-30' }
  ];

  return Promise.all(ranges.map(async range => {
    const listings = await db.listingWindows.findMany({
      where: {
        market_context_id: marketId,
        listed_price: { gte: range.min, lt: range.max }
      },
      include: { transactions: true }
    });

    const salesCount = listings.reduce((sum, l) => sum + l.sold_count, 0);

    return {
      priceRange: range.label,
      listingCount: listings.length,
      salesCount,
      conversionRate: listings.length > 0 ? salesCount / listings.length : 0,
      averageMatchPercent: calculateAverageMatch(listings)
    };
  }));
}
```

---

## Related Documents

- [Model Training Deep Dive](./06_MODEL_TRAINING.md) - How match % is calculated
- [Profile and Matching](./12_PROFILE_AND_MATCHING.md) - User profile and matching logic
- [Cashback Flow Deep Dive](./09_CASHBACK_FLOW.md) - How cashback is processed

---

*This document provides exhaustive detail on pricing logic. Refer to specific component documents for related systems.*
