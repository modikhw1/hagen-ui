# letrend - Customer Interface Outline

> **Purpose**: Define the customer-facing interface for the concept recommendation service
> **Status**: Revised based on owner input
> **Updated**: January 1, 2026

---

## Service Summary

**letrend** is a recommendation service where small businesses (cafés, restaurants, bars, barbers) discover video concepts that fit their business. We watch hundreds of viral videos and curate what works—then match concepts to each business's profile.

### Value Proposition

"Proven ideas for your business's social media. We watched hundreds of videos. Here's what we picked for businesses like yours."

### Core Mental Model

letrend is **not a marketplace you browse**—it's a recommendation service that shows you what fits.

| We Are | We Are Not |
|--------|------------|
| Human-curated recommendations | Algorithmic marketplace |
| "Here's what works for you" | "Browse 45 concepts" |
| Personalized match scores | Generic virality metrics |
| Plain-language guidance | Technical jargon |

---

## Target Users

### Primary: Business Owners
- Café, restaurant, bar, barber/salon, retail, gym owners
- **Tech comfort**: Mid to low
- **Goal**: Figure out social media content
- **Mindset**: "I know I should be posting, but I don't know what"

### User Profile Data Collected
| Field | How Collected | Why Needed |
|-------|---------------|------------|
| Business type | AI chat | Match to industry-appropriate concepts |
| Team size | AI chat | Filter by people required |
| Content experience | AI chat | Show appropriate difficulty |
| Tone preference | AI chat | Match humor style |
| Camera comfort | AI chat | Filter acting requirements |
| Location | Auto-detect | PPP pricing |

---

## Customer Journey & Pages

### Phase 0: Onboarding (NEW)

#### Landing Page (`/`)
**Purpose**: Get visitors into the profile chat

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo]                                              [Login]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│     Proven ideas for your business's social media                │
│                                                                  │
│     We watch hundreds of viral videos so you don't have to.      │
│     Here's what works for businesses like yours.                 │
│                                                                  │
│     [Let's find concepts for your café →]                       │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  WHY LETREND                                                     │
│                                                                  │
│  • Human-curated, not algorithmic                               │
│  • Picked for businesses like yours                             │
│  • Plain-text guidance, not tech jargon                         │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  SAMPLE CONCEPTS (headline + difficulty only)                    │
│                                                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ "Employee   │ │ "Customer   │ │ "POV: The   │               │
│  │  dreads..." │ │  asks for..."│ │  order is..."│               │
│  │             │ │             │ │             │               │
│  │ Easy        │ │ Medium      │ │ Easy        │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
│                                                                  │
│  No prices, no details—just a taste of what's available         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**What's NOT on landing page:**
- No video previews or thumbnails
- No "Browse all" option
- No pricing until profile is created
- No filters or search

---

#### Onboarding Chat (`/start`)
**Purpose**: Build user profile through conversational AI

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │  Hey! Let's figure out what kinds of video concepts       │  │
│  │  would work for your business.                            │  │
│  │                                                           │  │
│  │  First up—what kind of business do you run?               │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Café]  [Restaurant]  [Bar]  [Barber/Salon]                   │
│  [Retail]  [Gym]  [Other...]                                   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Or type your answer...                                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Conversation Flow:**
1. Business type (café, restaurant, bar, barber, retail, gym)
2. Team size (just me, 2 people, small team, bigger team)
3. Content experience (never, occasionally, regularly)
4. Tone preference (funny, wholesome, professional, edgy)
5. Camera comfort (nervous, fine, love it)
6. Optional: Social links for tone inference

**End of chat:**
> "Great! Based on what you told me, here are concepts that should work for your café."

---

### Phase 1: Recommendations

#### For You Page (`/for-you`)
**Purpose**: Show personalized concept recommendations

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo]           [For You]  [My Concepts]        [$3] [👤 ▼]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Concepts for [Business Name]'s café                            │
│  [Update preferences]                                           │
│                                                                  │
│  ┌───────────────────┐ ┌───────────────────┐ ┌─────────────────┐│
│  │ 🇺🇸                │ │ 🇬🇧                │ │ 🇦🇺              ││
│  │                   │ │                   │ │                 ││
│  │ "Employee dreads  │ │ "Customer tries   │ │ "POV: You have  ││
│  │  telling kitchen  │ │  to order off-    │ │  to work the    ││
│  │  about mistake"   │ │  menu item"       │ │  morning shift" ││
│  │                   │ │                   │ │                 ││
│  │ 🔥🔥🔥○○ Trending   │ │ 🔥🔥○○○ Rising     │ │ 🔥🔥🔥🔥○ Peak    ││
│  │                   │ │                   │ │                 ││
│  │ 94% match         │ │ 87% match         │ │ 91% match       ││
│  │                   │ │                   │ │                 ││
│  │ 👥 1-2  ⏱ 15min   │ │ 👥 2  ⏱ 20min     │ │ 👥 1  ⏱ 10min   ││
│  │ Easy              │ │ Takes practice    │ │ Easy            ││
│  │                   │ │                   │ │                 ││
│  │ $24               │ │ $28               │ │ $22             ││
│  └───────────────────┘ └───────────────────┘ └─────────────────┘│
│                                                                  │
│  [▼ Filters]  (collapsed - difficulty, people count)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Card Elements (no video/thumbnail):**
- Origin country flag
- Headline (concept in one sentence)
- Trend lifecycle indicator (fire icons)
- Match percentage (primary decision factor)
- Quick stats: people, time, difficulty level
- Price ($20-30 range, PPP-adjusted)

**Sorting:** Default by match % (highest first)

---

### Phase 2: Evaluation

#### Concept Detail (`/concept/[uuid]`)
**Purpose**: Enough info to decide, without revealing the concept

```
┌─────────────────────────────────────────────────────────────────┐
│  [← For You]                                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  "Employee dreads telling kitchen about a mistake—               │
│   gets a calm response"                                          │
│                                                                  │
│  🇺🇸 Originally from United States                               │
│  Seen 847 times in 12 languages                                  │
│                                                                  │
│  ─────────────────────────────────────────────────              │
│                                                                  │
│  94% match for your café                                         │
│                                                                  │
│  Why it's a good fit:                                            │
│  • Works great for food service                                  │
│  • Only needs 2 people                                           │
│  • Matches your funny/casual tone                                │
│  • Easy to film—no fancy equipment                               │
│                                                                  │
│  ─────────────────────────────────────────────────              │
│                                                                  │
│  🔥🔥🔥○○ Trending                                                │
│  "Still getting good traction—not oversaturated yet"             │
│                                                                  │
│  ─────────────────────────────────────────────────              │
│                                                                  │
│  What you'll need:                                               │
│  • 2 people (employee + manager/chef)                            │
│  • About 15 minutes to film                                      │
│  • Just your phone camera                                        │
│  • Kitchen or back-of-house setting                              │
│                                                                  │
│  Difficulty: Easy                                                │
│  "Anyone can do this—just look nervous, then relieved"          │
│                                                                  │
│  ─────────────────────────────────────────────────              │
│                                                                  │
│  $24                                                             │
│                                                                  │
│  [Get This Concept]                                              │
│                                                                  │
│  Film your version → get some back                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Pre-Purchase Shows:**
- Headline
- Origin country + spread data
- Match % with explanation
- Trend lifecycle with context
- What you'll need (plain list)
- Difficulty with plain explanation
- Price
- Subtle cashback mention

**Pre-Purchase Hides (the product):**
- Video
- Script/transcript
- Scene breakdown
- Detailed how-to guidance

---

### Phase 3: Purchase

#### Checkout (`/checkout/[uuid]`)
**Purpose**: Simple, confident purchase

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  "Employee dreads telling kitchen..."                            │
│  94% match • Easy • 1-2 people                                   │
│                                                                  │
│  $24                                                             │
│                                                                  │
│  [Card input - Stripe Elements]                                 │
│                                                                  │
│  [Pay $24]                                                       │
│                                                                  │
│  Film your version → get some back                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Simplified:**
- No itemized breakdown
- No cashback line items
- Just the price
- Credits auto-applied if available

---

### Phase 4: Learning (Core Product)

#### Concept Viewer (`/viewer/[uuid]`)
**Purpose**: Everything needed to film this concept (phone-friendly)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [← My Concepts]                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │                                 │  │                              │  │
│  │        VIDEO PLAYER             │  │  THE CONCEPT                 │  │
│  │                                 │  │  Plain explanation of what   │  │
│  │   [Full video with subtitles]   │  │  this video is about         │  │
│  │   Translated to your language   │  │                              │  │
│  │                                 │  │  ──────────────────────────  │  │
│  │                                 │  │                              │  │
│  │  [⏪]  [▶️]  [⏩]               │  │  THE SCRIPT                  │  │
│  │                                 │  │  Scene-by-scene:             │  │
│  └─────────────────────────────────┘  │  1. Employee looks nervous   │  │
│                                       │  2. Walks to kitchen         │  │
│                                       │  3. "Hey, I messed up..."    │  │
│                                       │  4. Manager reacts calmly    │  │
│                                       │                              │  │
│                                       │  ──────────────────────────  │  │
│                                       │                              │  │
│                                       │  WHAT YOU'LL NEED            │  │
│                                       │  □ 2 people                  │  │
│                                       │  □ Phone camera              │  │
│                                       │  □ Kitchen/back area         │  │
│                                       │  □ ~15 minutes               │  │
│                                       │                              │  │
│                                       │  ──────────────────────────  │  │
│                                       │                              │  │
│                                       │  TIPS                        │  │
│                                       │  • Anyone can play employee  │  │
│                                       │  • Manager doesn't need to   │  │
│                                       │    be actual manager         │  │
│                                       │  • Keep "mistake" vague      │  │
│                                       │                              │  │
│                                       └──────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Mobile Priority:** Script/guide readable on phone during filming

**Language Style:**
- NOT: "Shot complexity: 3/10"
- YES: "One camera angle, no fancy cuts needed"

- NOT: "Acting skill required: 4/10"
- YES: "Anyone can do this—just look nervous, then relieved"

---

### Phase 5: My Concepts

#### My Concepts (`/my-concepts`)
**Purpose**: Access purchased concepts, track production

```
┌─────────────────────────────────────────────────────────────────┐
│  MY CONCEPTS                                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Store credit: $3.00 (auto-applied on next purchase)            │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ "Employee dreads telling kitchen..."                       │  │
│  │ Purchased Jan 1                                            │  │
│  │ [View Concept]  [Link Your Video]                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ "Customer tries to order off-menu item..."                 │  │
│  │ Video linked • Earned $3 credit                            │  │
│  │ [View Concept]                                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Simplified from "My Purchases":**
- Focus on production journey, not transaction history
- No prominent deadline countdowns (cashback de-emphasized)

---

#### Submit Video (`/submit/[uuid]`)
**Purpose**: Link produced content (subtle, for feedback data)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Link your video                                                 │
│                                                                  │
│  For: "Employee dreads telling kitchen..."                       │
│                                                                  │
│  Platform:                                                       │
│  ○ TikTok  ○ Instagram  ○ YouTube                               │
│                                                                  │
│  Video URL:                                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ https://                                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Submit]                                                        │
│                                                                  │
│  We'll check it out and credit you if it works.                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Tone:** Casual, not transactional. For feedback loop, not cashback redemption.

---

## Staff Interface

Separate from customer app, accessed at `/staff`:

| Page | Purpose |
|------|---------|
| `/staff` | Dashboard |
| `/staff/add` | Add new concept (students) |
| `/staff/review` | Review queue (full staff) |

---

## URL Structure

```
/                         Landing page
/start                    Onboarding chat
/for-you                  Personalized recommendations
/concept/[uuid]           Concept detail (pre-purchase)
/checkout/[uuid]          Purchase
/viewer/[uuid]            Concept viewer (post-purchase)
/my-concepts              Owned concepts
/submit/[uuid]            Submit produced video
/profile                  Edit preferences
/account                  Account settings

/staff                    Staff dashboard (separate)
/staff/add                Add new concepts
/staff/review             Review queue
```

---

## Key UX Principles (Revised)

### 1. Recommendation Over Browse
- No endless scrolling through concepts
- Profile → personalized recommendations
- Match % tells users "this is for you"

### 2. Human-Curated Feel
- "We picked these" not "Algorithm suggests"
- Origin countries show global curation
- Plain language, no tech jargon

### 3. Profile First
- No meaningful recommendations without profile
- AI chat makes profile creation conversational
- Profile enables the match % feature

### 4. Plain Language
- Speak to mid/low tech comfort users
- "Easy to film" not "Production complexity: 3/10"
- "Anyone can do this" not "Acting skill required: 2"

### 5. Concept is the Product
- No video preview pre-purchase
- Text, match %, trend—enough to decide
- Full reveal only after purchase

### 6. Cashback De-emphasized
- Subtle mention: "Film it → get some back"
- Not prominent in pricing or UI
- Primary purpose: feedback data

### 7. Mobile-Friendly Viewer
- Script readable on phone between takes
- Video collapsible to prioritize script
- Works offline after initial load

---

## Pricing

| Aspect | Value |
|--------|-------|
| Price range | $20-30 per concept |
| PPP adjustment | Yes, based on market |
| Credits | From video submissions, auto-applied |

---

## What Changed from Original

| Original | Revised |
|----------|---------|
| Browse marketplace | Recommendation-first |
| Video preview options | No video pre-purchase |
| Virality score 8.2/10 | 94% match for your café |
| Prominent cashback | Subtle footnote |
| $5-15 pricing | $20-30 pricing |
| Technical stats | Plain language |
| My Purchases | My Concepts |
| Generic landing | Profile-first CTA |

---

## Detailed Documentation

For complete specifications, see:
- [01_USER_FLOWS.md](./interface/01_USER_FLOWS.md) - Step-by-step user journeys
- [02_COMPONENTS.md](./interface/02_COMPONENTS.md) - UI component specifications
- [03_INFORMATION_ARCHITECTURE.md](./interface/03_INFORMATION_ARCHITECTURE.md) - What info appears where
- [04_EDGE_CASES.md](./interface/04_EDGE_CASES.md) - Error handling and edge cases

---

*This outline defines the customer-facing interface for letrend. Revised based on owner input.*
