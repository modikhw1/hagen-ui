# Information Architecture - letrend

> **Purpose**: Define what information appears where and why
> **Status**: Revised based on owner input
> **Updated**: January 1, 2026

---

## Core Principle: Personalized Dashboard

letrend is **not a marketplace you browse**—it's a personalized dashboard that shows you what fits your business.

The mental model:
> "We watched hundreds of videos. Here's what we picked for cafés like yours."

NOT:
> "Browse 45 concepts, filter by industry..."

Key elements:
- **TikTok/IG sync** for automatic brand profiling
- **"How well we know you"** meter encourages profile growth
- **Curated rows** with match scores and scarcity cues
- **Mini-chat** for quick refinement without leaving dashboard

---

## Progressive Disclosure (Revised)

Information revealed based on commitment level:

```
NEW VISITOR              PROFILED USER            BUYER                    PRODUCER
(no profile)             (completed chat)         (purchased)              (filming)
    │                         │                       │                        │
    ▼                         ▼                       ▼                        ▼
• Value prop              • Match %                • Full video             • Submit link
• "Get Started"           • Trend indicator        • Script                 • Deadline
• Sample cards            • Price                  • Plain-language guide
  (limited info)          • Origin country         • Checklist
                          • Headline               • "What you'll need"
                          • Difficulty level
```

**Key shift**: Users don't see meaningful recommendations until they have a profile.

---

## User Profile: Foundation of Everything

Before showing recommendations, we need to know:

| Data Point | How Collected | Why Needed |
|------------|---------------|------------|
| Business type | AI chat | Match to industry-appropriate concepts |
| Team size | AI chat or social sync | Filter by people required |
| Comfort level | AI chat + inference | Show appropriate difficulty |
| Tone preference | Social sync analysis | Match humor style |
| Content history | Social sync analysis | Calibrate expectations |
| Location/market | Auto-detect | PPP pricing, language |

### Social Sync (Primary Method)

| Platform | Data Extracted | Used For |
|----------|----------------|----------|
| TikTok | Bio, followers, posts, frequency, hashtags | Auto-fill profile, infer tone/style |
| Instagram | Bio, followers, posts, frequency | Backup/additional context |

**What we analyze from connected accounts:**
- Bio text → keywords, tone, positioning
- Follower count → business size inference
- Recent posts → content style, humor type, energy level
- Posting frequency → content experience level
- Hashtag patterns → industry, local focus

**"How well we know you" meter (0-100):**

| Factor | Points |
|--------|--------|
| Basic info (business type, team size) | +30 |
| Social sync completed | +25 |
| Tone/style confirmed | +15 |
| Goals discussed | +15 |
| Constraints specified | +15 |

Users can improve their score by connecting socials or chatting more.

**Collection methods:**
1. **Social sync** (preferred): "Drop your TikTok link and I'll figure out your vibe"
2. **AI chat** (fallback): Conversational questions for users without socials

---

## Page-by-Page Information Architecture

### 1. Landing Page (`/`)

**Goal**: Get visitors into the profile chat

| Section | Information | Why |
|---------|-------------|-----|
| Hero | "Proven ideas for your business's social media" | Immediate clarity |
| Value prop | Human-curated, not algorithmic | Differentiation |
| Sample cards | 2-3 concept previews (headline + difficulty only) | Demonstrate product |
| CTA | "Let's find concepts for your café" | Start profile chat |

**What's NOT shown:**
- Full concept cards with pricing (→ need profile first)
- Filters or browse functionality
- Video previews

**Tone**: Welcoming, not salesy. Speak to someone figuring out social media.

---

### 2. Onboarding Chat (`/start` or modal)

**Goal**: Build user profile through conversation

| Phase | Information Gathered | Tone |
|-------|---------------------|------|
| Intro | Business type (café, bar, restaurant, barber...) | Friendly, curious |
| Context | Team size, who films content | Practical |
| Comfort | Experience level, concerns | Reassuring |
| Tone | What kind of content feels right | Exploratory |
| Optional | Link socials for inference | "If you want, we can look at..." |

**Output**: Profile that powers recommendations

**What user sees at end**: "Great! Based on what you told me, here are concepts that should work for your café."

---

### 3. Recommendations Page (`/for-you`)

**Goal**: Show curated concepts that match their profile

This replaces the traditional "browse" page.

| Element | Information | Why |
|---------|-------------|-----|
| Personalized header | "Concepts for [Business Name]'s café" | Feels personal |
| Concept cards | Headline, match %, trend, difficulty, price | Quick evaluation |
| Profile link | "Update your preferences" | Control |
| Secondary filters | (Collapsed) Fine-tune if needed | Power users |

**Card Information Hierarchy (Revised):**
```
┌─────────────────────────────────────────┐
│ 🇺🇸 [Origin flag]                       │
│                                         │
│ "Employee dreads telling kitchen        │
│  about a mistake—gets calm response"    │ ← Headline
│                                         │
│ 🔥🔥🔥○○ Trending                        │ ← Trend lifecycle
│                                         │
│ 94% match for your café                 │ ← Match score (primary)
│                                         │
│ 👥 1-2  ⏱ 15 min  Easy                  │ ← Difficulty signals
│                                         │
│ $24                                     │ ← Price
└─────────────────────────────────────────┘
```

**Why this order:**
1. Origin flag adds "discovery" value (concepts from other markets)
2. Headline explains the concept
3. Trend shows timeliness
4. Match % is primary decision factor
5. Difficulty answers "Can I do this?"
6. Price is final factor

**NO thumbnail/video** - the concept is hidden until purchase.

---

### 4. Concept Detail Page (`/concept/[id]`)

**Goal**: Provide enough confidence to purchase without revealing the concept

| Section | Information | Why |
|---------|-------------|-----|
| Headline | The concept in one line | What they're buying |
| Match breakdown | "94% match: fits your tone, 1-person team, low effort" | Justify recommendation |
| Origin | Country flag, "Seen 847 times in 12 languages" | Social proof |
| Trend status | Visual lifecycle + explanation | Timeliness |
| Difficulty | Plain language: "Easy to film" | Confidence |
| What you'll need | People, time, equipment (plain list) | Practical |
| Price | $24 | Final decision |
| Footnote | "Film your version → get some back" | Subtle cashback |

**Information SHOWN (Pre-Purchase):**
- Headline (concept_core)
- Match % with explanation
- Origin country and spread data
- Trend lifecycle
- Difficulty level (Easy/Medium/Needs practice)
- What you'll need (plain list)
- Price

**Information HIDDEN (Post-Purchase):**
- Video
- Script/transcript
- Scene breakdown
- Detailed production notes
- Specific how-to guidance

**Rationale**: The concept itself is the product. Showing it pre-purchase eliminates need to buy.

---

### 5. Checkout Page (`/checkout/[id]`)

**Goal**: Simple, confident purchase

| Section | Information | Why |
|---------|-------------|-----|
| Summary | Headline, match %, difficulty | Confirm choice |
| Price | $24 (PPP-adjusted) | Clear total |
| Credits | If available, auto-applied | Reward loyalty |
| Payment | Card/wallet | Transaction |
| Footnote | "Film it, link it, get some back" | Subtle cashback |

**Simplified from original**: No cashback line-item breakdown. Just the price.

```
┌─────────────────────────────────────────┐
│ "Employee dreads telling kitchen..."    │
│ 94% match • Easy • 1-2 people           │
│                                         │
│ $24                                     │
│                                         │
│ [Pay $24]                               │
│                                         │
│ Film your version → get some back       │
└─────────────────────────────────────────┘
```

---

### 6. Concept Viewer (`/viewer/[id]`)

**Goal**: Everything needed to film this concept

**This is the core product.** Must be phone-friendly for between-takes reference.

| Section | Information | Purpose |
|---------|-------------|---------|
| Video | Full video with subtitles (translated) | Source material |
| The Concept | Plain-language explanation | "What this is" |
| The Script | What to say, scene by scene | "What to do" |
| What You'll Need | People, equipment, location | Checklist |
| Tips | Casting notes, flexibility ideas | Guidance |
| Checklist | Interactive prep checklist | Track progress |

**Language style:**
- NOT: "Shot complexity: 3/10"
- YES: "One camera angle, no fancy cuts needed"

- NOT: "Acting skill required: 4/10"
- YES: "Anyone can do this—just look nervous, then relieved"

**Phone-friendly priority**: The script/guide section should be readable on phone during filming.

---

### 7. My Concepts (`/my-concepts`)

**Goal**: Access purchased concepts, track production

| Section | Information | Why |
|---------|-------------|-----|
| Active | Concepts not yet filmed | Priority |
| Filming | Currently working on (optional status) | Progress |
| Done | Produced and submitted | Archive |
| Credits | Balance from submissions | Awareness |

**Simplified from "My Purchases"** - focus on production journey, not transaction history.

---

### 8. Submit Your Video (`/submit/[id]`)

**Goal**: Link produced content for feedback data

| Section | Information | Why |
|---------|-------------|-----|
| Concept | Which concept this is for | Context |
| Form | Platform + URL | Submission |
| Note | "We'll check it out and credit you if it works" | Simple explanation |

**Tone**: Casual, not transactional. This is about feedback loop, not cashback redemption.

---

## Data Visibility Matrix (Revised)

| Data Field | Landing | Chat | For You | Detail | Viewer |
|------------|---------|------|---------|--------|--------|
| value_prop | ✓ | — | — | — | — |
| business_type | — | ✓ collects | ✓ uses | ✓ uses | — |
| concept_headline | Sample | — | ✓ | ✓ | ✓ |
| match_percentage | — | — | ✓ | ✓ | — |
| trend_lifecycle | — | — | ✓ | ✓ | — |
| origin_country | — | — | ✓ | ✓ | ✓ |
| difficulty_level | Sample | — | ✓ | ✓ | ✓ |
| price | — | — | ✓ | ✓ | — |
| video | — | — | — | — | ✓ |
| script | — | — | — | — | ✓ |
| production_notes | — | — | — | Summary | ✓ |

---

## URL Structure (Revised)

```
/                         Landing page
/start                    Onboarding chat (or modal)
/for-you                  Personalized recommendations
/concept/[uuid]           Concept detail
/checkout/[uuid]          Purchase
/viewer/[uuid]            Concept viewer (post-purchase)
/my-concepts              Owned concepts
/submit/[uuid]            Submit produced video
/profile                  Edit preferences
/account                  Account settings

/staff                    Staff dashboard (separate)
/staff/add                Add new concepts (students)
/staff/review             Review queue
```

---

## Tone & Language Guidelines

### For business owners with mid/low tech comfort

**Technical terms → Plain language:**

| Don't Say | Say Instead |
|-----------|-------------|
| Virality score: 8.2 | 94% match for your café |
| Production complexity: Low | Easy to film |
| Acting skill required: 3/10 | Anyone can do this |
| Shot complexity: Single static | One camera, no fancy cuts |
| Editing dependency: 2/10 | Barely any editing |
| Replicability score: 9 | Straightforward to recreate |
| Cashback premium | Film it → get some back |
| PPP-adjusted pricing | $24 |

**Headlines should be conversational:**
- NOT: "POV format with subverted expectation payoff"
- YES: "Employee dreads telling kitchen about a mistake—gets calm response"

---

## Empty States

| Page | Message | Tone |
|------|---------|------|
| For You (no profile) | "Let's figure out what works for your business" | Inviting |
| For You (no matches) | "We're finding new concepts for you. Check back soon!" | Reassuring |
| My Concepts (empty) | "You haven't grabbed any concepts yet" | Casual |

---

## Why This Architecture Works

### For the target user (café/bar/restaurant owner):
1. **No overwhelm**: Recommendations, not endless browsing
2. **Confidence**: Match % tells them "this is for you"
3. **Plain language**: No marketing jargon or tech speak
4. **Trust**: Human-curated feels different from algorithm

### For the business:
1. **Profile data**: Enables better recommendations over time
2. **Hidden concept**: Protects IP until purchase
3. **Feedback loop**: Submissions provide performance data
4. **PPP pricing**: Market-appropriate prices

### For the vibe:
1. **Not a marketplace**: A service that helps you
2. **Not an algorithm**: Real people picked these
3. **Not complicated**: Just "here's what works for you"

---

*This document defines the information architecture for letrend.*
