# Component Specifications - letrend

> **Purpose**: Define behavior of every UI component
> **Status**: Revised based on owner input
> **Updated**: January 1, 2026

---

## Core Design Principles

1. **No video preview** - The concept is the product; no visual reveal until purchase
2. **Plain language** - No jargon, no technical scales, speak to mid/low tech comfort users
3. **Personalized dashboard** - Curated rows with match scores, scarcity cues, mini-chat
4. **Human-curated feel** - Not algorithmic, not marketplace-like
5. **Social sync** - TikTok/IG integration for automatic brand profiling
6. **Profile growth** - "How well we know you" meter encourages ongoing refinement

---

## Component Index

| Category | Components |
|----------|------------|
| [Navigation](#navigation) | Header, Footer, Breadcrumbs |
| [Dashboard](#dashboard) | DashboardRow, MiniChat, ScarcityBadge |
| [Cards](#cards) | ConceptCard, OwnedConceptCard |
| [Profile](#profile) | ProfileMeter, SocialSync, ProfilePage |
| [Recommendations](#recommendations) | MatchScore, TrendLifecycle, DifficultyBadge |
| [Onboarding](#onboarding) | OnboardingChat, QuickSelect, ProfileStatus |
| [Video](#video) | VideoPlayer, SubtitleOverlay |
| [Forms](#forms) | FilterBar, CheckoutForm, SubmitForm |
| [Feedback](#feedback) | Toast, Modal, Badge |
| [Layout](#layout) | Sidebar, TabPanel, Accordion, Checklist |

---

## Navigation

### Header

**Purpose**: Global navigation, auth status, profile indicator

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LOGGED OUT / NO PROFILE:                                                     │
│ [Logo]                                              [Login] [Get Started]   │
├─────────────────────────────────────────────────────────────────────────────┤
│ LOGGED IN WITH PROFILE:                                                      │
│ [Logo]           [For You]  [My Concepts]          [$3 credit] [👤 ▼]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**States:**
| State | Shows |
|-------|-------|
| No profile | Logo, Login, Get Started |
| Has profile | Logo, For You, My Concepts, Credits (if any), User menu |
| Staff | + Staff link |

**Key Changes from Original:**
- "Browse" → "For You" (recommendation-first)
- "My Purchases" → "My Concepts" (softer language)
- Profile indicator shows personalization is active

**Behaviors:**
- Logo → Homepage
- Credits badge → /my-concepts
- User menu dropdown: Profile, Account, Logout
- Profile link: "Update your preferences"

**Mobile:**
```
┌─────────────────────────────────────────┐
│ [☰]  [Logo]              [👤]          │
└─────────────────────────────────────────┘
```
- Hamburger opens slide-out menu
- Menu: For You, My Concepts, Profile, Account, Logout

---

### Footer

**Purpose**: Secondary navigation, legal, trust signals

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  letrend                    Links              Legal                        │
│  Proven concepts            How It Works       Terms of Service             │
│  for your business          FAQ                Privacy Policy               │
│                             Contact                                         │
│                                                                              │
│  © 2026 letrend                                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Behaviors:**
- Present on all pages except Viewer (distraction-free)
- Links open in same tab
- Mobile: Stacked layout

---

### Breadcrumbs

**Purpose**: Show location, enable back navigation

| Page | Breadcrumbs |
|------|-------------|
| Homepage | None |
| For You | None (top level) |
| Concept Detail | For You > [Concept headline] |
| Checkout | For You > [Concept] > Checkout |
| Viewer | My Concepts > [Concept] |
| Submit | My Concepts > [Concept] > Submit |

**Behavior:**
- Each segment clickable
- Truncate long headlines: "Employee dreads telling kit..." (max 35 chars)

---

## Dashboard

### DashboardRow

**Purpose**: Horizontal row of concept cards with category label

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ "Top matches for you"                                        [See all →]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ 94% match   │  │ 91% match   │  │ 89% match   │  │ 87% match   │  →     │
│  │ "Employee..." │  │ "Customer..." │  │ "Behind..." │  │ "Day in..." │      │
│  │ Easy • $24  │  │ Easy • $22  │  │ Med • $26   │  │ Easy • $21  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Row Types:**
| Type | Label | Filter Logic |
|------|-------|--------------|
| Top Matches | "Top matches for you" | Sorted by match % |
| Fresh | "Still fresh—not overdone yet" | concepts < 3 days old |
| Local | "Working in your country" | Trending in user's geo |
| Easy Wins | "Easy wins—film in 10 minutes" | Easy difficulty + short time |

**Behavior:**
- Horizontal scroll on mobile
- Arrow buttons on desktop
- "See all" expands to filtered view
- 4-6 cards per row

---

### MiniChat

**Purpose**: Quick refinement without leaving dashboard

```
┌─────────────────────────────────────┐
│ 💬 Quick refinement           [−]   │
│ ─────────────────────────────────── │
│                                     │
│ "Show me stuff for a product launch"│
│                                     │
│                        [Send]       │
└─────────────────────────────────────┘
```

**States:**
| State | Display |
|-------|---------|
| Collapsed | Just icon + "Quick chat" |
| Expanded | Text input + send |
| Processing | Loading indicator |
| Response | Dashboard refreshes with context |

**Position:** Bottom-right corner, docked

**Example inputs:**
- "Looking for something edgier today"
- "I want to promote our new menu item"
- "Show me what works in winter"
- "Only show me stuff I can film alone"

**Behavior:**
- Input refines current dashboard view
- Context persists for session
- Can be dismissed
- Mobile: Full-width bottom sheet

---

### ScarcityBadge

**Purpose**: Visual cues for urgency and social proof

**Variants:**
```
🔥 NEW           ← concepts < 3 days old (orange)
3 left           ← when per_market_cap nearly reached (red)
12 cafés got this ← anonymized purchase count (blue)
🇺🇸 Trending     ← geo-relevant (flag + label)
```

**Rules:**
| Badge | When to Show |
|-------|--------------|
| 🔥 NEW | Concept created < 72 hours ago |
| X left | available_count <= 3 |
| X [type] got this | purchase_count >= 5, same industry |
| 🇺🇸 Trending | Trending in user's country |

**Styling:**
- Small pill badges
- Positioned top-left of card
- Max 2 badges per card (prioritize scarcity)

---

## Profile

### ProfileMeter

**Purpose**: Show "How well we know you" score and encourage growth

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  How well we know you: ████████░░ 78%          [Improve this →]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Score Factors:**
| Factor | Points |
|--------|--------|
| Basic info (business type, team size) | +30 |
| Social sync completed | +25 |
| Tone/style confirmed | +15 |
| Goals discussed | +15 |
| Constraints specified | +15 |

**Visual:**
- Progress bar with percentage
- Color: Gray (0-40%), Yellow (40-70%), Green (70-100%)
- "Improve this" links to chat

**Behavior:**
- Clicking opens profile chat
- Updates in real-time as profile improves

---

### SocialSync

**Purpose**: Connect and manage TikTok/Instagram accounts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CONNECTED ACCOUNTS                                                          │
│                                                                              │
│ 🔗 TikTok: @yourcafe                                                        │
│    ✓ Connected • Last synced 2 days ago              [Resync] [Disconnect] │
│                                                                              │
│ 📷 Instagram: Not connected                                                 │
│    Connect to improve recommendations                       [Connect →]    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**States:**
| Platform | State | Actions |
|----------|-------|---------|
| TikTok | Connected | [Resync] [Disconnect] |
| TikTok | Not connected | [Connect →] |
| Instagram | Connected | [Resync] [Disconnect] |
| Instagram | Not connected | [Connect →] |

**Sync Process:**
1. User provides handle/URL
2. System fetches public profile data
3. Analysis runs on recent posts
4. Profile updated with inferred attributes
5. "Last synced X ago" shown

**What We Analyze:**
- Bio text
- Follower count
- Recent posts (style, humor, energy)
- Posting frequency
- Hashtag patterns

---

### ProfilePage

**Purpose**: Central hub for brand identity management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  YOUR BRAND PROFILE                                                         │
│                                                                              │
│  [ProfileMeter: ████████░░ 78%]                                            │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────     │
│                                                                              │
│  [SocialSync section]                                                       │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────     │
│                                                                              │
│  WHAT WE KNOW                                                               │
│  • Business: Café in Austin                                                 │
│  • Vibe: Playful, casual                                                    │
│  • Team: Just you                                                           │
│  • Experience: Posts a few times a week                                     │
│  [Edit manually]                                                            │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────     │
│                                                                              │
│  CHAT WITH US                                                               │
│  💬 "Tell me about a new direction, goal, or constraint"                   │
│  [Start chat →]                                                            │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────     │
│                                                                              │
│  PREVIOUS PURCHASES                                        [View all →]    │
│  [3 most recent purchase cards]                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Sections:**
1. ProfileMeter - with CTA to improve
2. SocialSync - manage connected accounts
3. What We Know - editable profile summary
4. Chat With Us - ongoing conversation access
5. Previous Purchases - quick access to owned concepts

**URL:** /profile

---

## Cards

### ConceptCard

**Purpose**: Display concept in recommendations grid

**NO thumbnail or video** - text and indicators only.

```
┌─────────────────────────────────────────┐
│ 🇺🇸 [Origin flag]                       │
│                                         │
│ "Employee dreads telling kitchen        │
│  about a mistake—gets calm response"    │  ← Headline (max 2 lines)
│                                         │
│ 🔥🔥🔥○○ Trending                        │  ← TrendLifecycle
│                                         │
│ 94% match for your café                 │  ← MatchScore (primary)
│                                         │
│ 👥 1-2  ⏱ 15 min  Easy                  │  ← DifficultyBadge row
│                                         │
│ $24                                     │  ← Price
└─────────────────────────────────────────┘
```

**States:**
| State | Visual |
|-------|--------|
| Default | As shown |
| Hover | Slight lift (shadow), border highlight |
| Sold out | Grayed out, "Sold out" indicator |

**Data displayed:**
| Field | Source | Fallback |
|-------|--------|----------|
| Origin flag | country emoji | None |
| Headline | concept_core | "Untitled Concept" |
| Trend | trend_lifecycle state | Hide if not available |
| Match % | calculated from profile match | Hide if no profile |
| People | casting.minimumPeople | "—" |
| Time | production.timeToRecreate (plain) | "—" |
| Difficulty | calculated → Easy/Medium/Needs practice | "—" |
| Price | PPP-adjusted | "$—" |

**Click behavior:**
- Entire card clickable → /concept/[uuid]

---

### OwnedConceptCard

**Purpose**: Display purchased concept in My Concepts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  "Employee dreads telling kitchen about a mistake..."                       │
│  Purchased Jan 1                                                            │
│                                                                              │
│  [View Concept]  [Link Your Video]                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**States:**
| State | Secondary Info | Actions |
|-------|----------------|---------|
| Active | "Purchased [date]" | [View] [Link Your Video] |
| Submitted | "Video linked" | [View] |
| Credited | "Earned $X credit" (green) | [View] |

**Simplified from original:**
- No deadline countdown (cashback is de-emphasized)
- No thumbnail (consistency with no-preview approach)
- Cleaner, simpler layout

---

## Recommendations

### MatchScore

**Purpose**: Show how well a concept matches user's profile

```
┌─────────────────────────────────────────┐
│ 94% match for your café                 │
└─────────────────────────────────────────┘
```

**Variants:**
| Match % | Color | Additional Context |
|---------|-------|-------------------|
| 90-100% | Green | "Great fit" |
| 75-89% | Blue | "Good match" |
| 60-74% | Gray | "Might work" |
| < 60% | Hidden | Don't show low matches |

**Expanded (on detail page):**
```
94% match for your café

Why it's a good fit:
• Works great for food service
• Only needs 2 people
• Matches your funny/casual tone
• Easy to film—no fancy equipment
```

**Calculation factors:**
- Business type alignment
- Team size vs. people required
- Tone preference alignment
- Camera comfort vs. acting requirements
- Content experience vs. difficulty

---

### TrendLifecycle

**Purpose**: Show where a concept is in its trend lifecycle

**Visual states:**
```
Fresh:     🔥○○○○  "Just appeared"
Rising:    🔥🔥○○○  "Picking up"
Trending:  🔥🔥🔥○○  "Hot right now"
Peak:      🔥🔥🔥🔥○  "Peak popularity"
Maturing:  🔥🔥🔥🔥🔥  "Still works"
```

**Card display:** Icon row + single word label
```
🔥🔥🔥○○ Trending
```

**Detail page:** Icon + context sentence
```
🔥🔥🔥○○ Trending
"Still getting good traction—not oversaturated yet"
```

**Hover/tap (optional):** "Seen 847 times in 12 languages"

**Colors:**
- Fresh: Orange
- Rising: Orange-red
- Trending: Red
- Peak: Deep red
- Maturing: Maroon

---

### DifficultyBadge

**Purpose**: Show how hard a concept is to produce (in plain language)

**Levels:**
| Level | Badge | Description |
|-------|-------|-------------|
| Easy | `Easy` (green) | "Anyone can do this" |
| Medium | `Takes practice` (yellow) | "Some experience helps" |
| Hard | `Needs experience` (red) | "For confident creators" |

**NOT using:**
- Numeric scores (no "3/10")
- Technical terms (no "shot complexity")

**Detail page expanded:**
```
Difficulty: Easy
"Anyone can do this—just look nervous, then relieved"
```

---

## Onboarding

### OnboardingChat

**Purpose**: Conversational interface for building user profile

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  🤖 Hey! Let's figure out what kinds of video concepts               │  │
│  │     would work for your business.                                    │  │
│  │                                                                       │  │
│  │     First up—what kind of business do you run?                       │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  [Café]  [Restaurant]  [Bar]  [Barber/Salon]                               │
│  [Retail]  [Gym]  [Other...]                                               │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Or type your answer...                                                │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Message Types:**
| Type | Style |
|------|-------|
| AI message | Left-aligned, bot icon, bubble background |
| User response | Right-aligned, highlighted background |
| Quick select | Buttons below AI message |

**Behaviors:**
- Auto-scroll to latest message
- Quick select buttons clickable
- Free text input always available
- Can go back (show previous question again)
- Progress indicator (optional: 3 dots showing step)

**Conversation Flow:**
1. Business type → Quick select
2. Team size → Quick select
3. Content experience → Quick select
4. Tone preference → Quick select
5. Camera comfort → Quick select
6. Social links (optional) → Text input + skip
7. Completion → CTA to recommendations

---

### QuickSelect

**Purpose**: Fast answer buttons in onboarding chat

```
[Café]  [Restaurant]  [Bar]  [Barber/Salon]
[Retail]  [Gym]  [Other...]
```

**Behavior:**
- Click selects and advances conversation
- "Other..." opens free text input
- Selected button shows checkmark briefly
- Buttons disappear after selection (replaced by user's answer)

**Styling:**
- Rounded pill buttons
- Light background, dark text
- Hover: darker background
- Selected: brief highlight animation

---

### ProfileStatus

**Purpose**: Show that recommendations are personalized

**In header (subtle):**
```
[For You] ← Personalized for your café
```

**On recommendations page:**
```
Concepts for [Business Name]'s café
[Update preferences]
```

**Behaviors:**
- Click "Update preferences" → /profile (edit mode)
- Shows business type from profile
- Green dot indicates profile is active

---

## Video

### VideoPlayer

**Purpose**: Full video playback in concept viewer (post-purchase only)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                         [VIDEO FRAME]                                        │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  "Hey everyone, um..."                                                │  │  ← Subtitle
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  ← Timeline
│                                                                              │
│  [⏪]  [▶️]  [⏩]      0:08 / 0:24      [CC]  [⚙]  [⛶]                      │  ← Controls
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Controls:**
| Control | Function |
|---------|----------|
| ⏪ | Skip back 5 seconds |
| ▶️ / ⏸️ | Play / Pause |
| ⏩ | Skip forward 5 seconds |
| Timeline | Seek (click/drag) |
| CC | Toggle subtitles |
| ⚙ | Settings (playback speed) |
| ⛶ | Fullscreen |

**Playback speeds:** 0.5x, 0.75x, 1x (default), 1.25x, 1.5x, 2x

**No download enforcement:**
```html
<video
  controlsList="nodownload"
  disablePictureInPicture
  oncontextmenu="return false"
>
```

**URL expiry handling:**
- Monitor for 403 errors
- On expiry: Pause video, show modal "Session timed out. [Refresh]"
- Refresh: Fetch new signed URL, resume from same position

**Mobile optimization:**
- Collapsible to give script priority
- Tap to expand/collapse
- Works in portrait and landscape

---

### SubtitleOverlay

**Purpose**: Display translated subtitles over video

**Position:** Bottom of video, above controls

**Styling:**
```css
.subtitle {
  background: rgba(0, 0, 0, 0.75);
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 16px;
  max-width: 80%;
  text-align: center;
}
```

**Behavior:**
- Sync with video time
- Translated to user's language
- Toggle via CC button
- Default: On (if not native language)

---

## Forms

### FilterBar

**Purpose**: Secondary filtering on recommendations (collapsed by default)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [▼ Filters]                                                                  │
│                                                                              │
│ (Expanded)                                                                   │
│ Difficulty: [Any ▼]  People: [Any ▼]                           [Clear all]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Filter options:**
| Filter | Options |
|--------|---------|
| Difficulty | Any, Easy, Takes practice, Needs experience |
| People | Any, Just me, 2 people, 3+ people |

**Simplified from original:**
- Fewer filters (profile does most of the work)
- Plain language options
- Secondary to recommendations

**Behavior:**
- Collapsed by default (recommendations are primary)
- Filters apply immediately
- URL updates with query params

---

### CheckoutForm

**Purpose**: Simple payment flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  "Employee dreads telling kitchen..."                                       │
│  94% match • Easy • 1-2 people                                              │
│                                                                              │
│  $24                                                                        │
│                                                                              │
│  [Card input - Stripe Elements]                                             │
│                                                                              │
│  [Pay $24]                                                                  │
│                                                                              │
│  Film your version → get some back                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**If credits available:**
```
Credits applied: -$5.00
Amount due: $19.00
```

**Simplified from original:**
- No itemized breakdown
- No cashback premium line item
- Just the price
- Credits auto-applied

**States:**
| State | UI |
|-------|-----|
| Default | Form enabled |
| Submitting | Button disabled + spinner |
| Error | Error message, form re-enabled |
| Success | Redirect to success |

---

### SubmitForm

**Purpose**: Link produced video (de-emphasized)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Link your video                                                            │
│                                                                              │
│  For: "Employee dreads telling kitchen..."                                  │
│                                                                              │
│  Platform:                                                                  │
│  ○ TikTok  ○ Instagram  ○ YouTube                                          │
│                                                                              │
│  Video URL:                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ https://                                                              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  [Submit]                                                                   │
│                                                                              │
│  We'll check it out and credit you if it works.                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Tone:** Casual, not transactional
- "Link your video" not "Submit for cashback"
- "We'll check it out" not "Your submission will be processed"

**URL validation patterns:**
```javascript
const patterns = {
  tiktok: /tiktok\.com\/@[\w.-]+\/video\/\d+/,
  instagram: /instagram\.com\/(reel|p)\/[\w-]+/,
  youtube: /youtube\.com\/shorts\/[\w-]+/
};
```

---

## Feedback

### Toast

**Purpose**: Brief feedback messages

**Types:**
| Type | Color | Icon | Duration |
|------|-------|------|----------|
| Success | Green | ✓ | 3s |
| Error | Red | ✗ | 5s |
| Info | Blue | ℹ | 4s |

**Position:** Top-center (both desktop and mobile)

**Plain language messages:**
- Success: "Got it!" not "Operation completed successfully"
- Error: "Something went wrong. Try again." not "Error code: 500"

---

### Modal

**Purpose**: Focused actions requiring attention

**Types:**
| Type | Use Case |
|------|----------|
| Auth | Login prompt when needed |
| Alert | Session expired |
| Confirm | Delete account (rare) |

**Structure:**
```
┌─────────────────────────────────────────┐
│ [Title]                           [✕]  │
├─────────────────────────────────────────┤
│                                         │
│ [Content]                               │
│                                         │
├─────────────────────────────────────────┤
│              [Cancel]  [Primary Action] │
└─────────────────────────────────────────┘
```

**Behavior:**
- Backdrop click → close
- Escape key → close
- Focus trap inside modal

---

### Badge

**Purpose**: Simple status indicators

**Variants:**
| Variant | Color | Use |
|---------|-------|-----|
| success | Green | Credit earned |
| info | Blue | Submitted |
| neutral | Gray | Default |

---

## Layout

### Sidebar (Viewer)

**Purpose**: Content sections in concept viewer

```
┌─────────────────────────────────────────┐
│ THE CONCEPT                              │
│ ─────────────────────────────────────   │
│ Plain explanation of what this video is  │
│ about and why it works.                  │
│                                         │
│ THE SCRIPT                               │
│ ─────────────────────────────────────   │
│ Scene-by-scene breakdown:                │
│ 1. Employee looks nervous                │
│ 2. Walks to kitchen                      │
│ 3. "Hey, I messed up..."                │
│ 4. Manager reacts calmly                 │
│                                         │
│ WHAT YOU'LL NEED                         │
│ ─────────────────────────────────────   │
│ □ 2 people                               │
│ □ Phone camera                           │
│ □ Kitchen/back area                      │
│ □ ~15 minutes                            │
│                                         │
│ TIPS                                     │
│ ─────────────────────────────────────   │
│ • Anyone can play the employee           │
│ • The manager doesn't need to be real    │
│ • Keep the "mistake" vague               │
│                                         │
└─────────────────────────────────────────┘
```

**Sections (scrollable):**
1. The Concept - Plain explanation
2. The Script - Scene-by-scene
3. What You'll Need - Checklist
4. Tips - Flexibility notes

**No tabs** - single scrollable view
**Mobile:** Same content, full width, video collapsible

---

### Accordion

**Purpose**: Collapsible sections (FAQ, mobile alternate)

```
┌─────────────────────────────────────┐
│ ▼ The Script                        │
├─────────────────────────────────────┤
│ [Content visible]                   │
├─────────────────────────────────────┤
│ ▶ What You'll Need                  │
├─────────────────────────────────────┤
│ ▶ Tips                              │
└─────────────────────────────────────┘
```

---

### Checklist

**Purpose**: Interactive preparation checklist

```
WHAT YOU'LL NEED
☑ Got 2 people
☑ Found filming spot
☐ Rehearsed the lines
☐ Test filmed once
```

**Behavior:**
- Click to toggle
- State saved to localStorage
- Persists across sessions

---

## Responsive Breakpoints

| Breakpoint | Width | Layout Changes |
|------------|-------|----------------|
| Mobile | < 640px | Single column, hamburger, video collapsible |
| Tablet | 640-1024px | Two columns where appropriate |
| Desktop | > 1024px | Full layout, sidebar |

---

## Component Library

**Recommendation: shadcn/ui + Tailwind**

Reasons:
- Pre-built accessible components
- Customizable to match plain-language design
- No package lock-in
- Good for rapid development

---

## Language Guidelines for Components

All component text should follow plain-language principles:

| Instead of | Use |
|------------|-----|
| "Production complexity: 3/10" | "Easy to film" |
| "Submit cashback claim" | "Link your video" |
| "Error 500: Server error" | "Something went wrong" |
| "Virality score: 8.2" | "94% match for your café" |
| "Requirements: 2 personnel" | "You'll need 2 people" |
| "Purchase complete" | "You've got it!" |

---

*This document specifies component behavior for letrend. Revised based on owner input.*
