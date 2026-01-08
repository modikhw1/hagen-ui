# Component 12: Profile and Matching Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)
> **Component**: User Profile and Match Percentage System
> **Last Updated**: January 1, 2026

---

## Overview

The profile and matching system enables personalized recommendations by combining user profile data with concept analysis to calculate a **match percentage** (0-100) for each concept/user pair.

This replaces the previous "virality score" approach with a user-centric metric that answers: "How good is this concept *for this specific user*?"

---

## 1. User Profile

### 1.1 Profile Schema

```typescript
interface UserProfile {
  id: string;
  userId: string;
  businessDescription: string;    // "Coffee shop in Austin"
  goals: string[];                // ["More foot traffic", "Brand awareness"]
  constraints: string[];          // ["Just me", "Limited budget"]
  industryTags: string[];         // ["food", "beverage", "local"]
  onboardingComplete: boolean;
  profileCompleteness: number;    // 0-100 "How well we know you" meter
  createdAt: string;
  updatedAt: string;

  // Social sync data
  socialLinks: {
    tiktok?: string;              // @handle or URL
    instagram?: string;           // @handle or URL
  };
  socialAnalysis?: SocialAnalysis;
}

interface SocialAnalysis {
  platform: 'tiktok' | 'instagram';
  analyzedAt: string;
  bio: string;
  followers: number;
  postingFrequency: 'rarely' | 'occasionally' | 'regularly' | 'daily';
  contentStyle: string[];         // ["behind-the-scenes", "quick-humor"]
  humorType?: string;             // "playful", "dry", "physical"
  energyLevel: 'low' | 'medium' | 'high';
  hashtagPatterns: string[];      // Common hashtags used
  inferredTone: string;           // "casual", "professional", "edgy"
  inferredTeamSize: 'solo' | 'duo' | 'small-team' | 'large-team';
}
```

### 1.2 Industry Tags

Standard tags for matching:

| Category | Tags |
|----------|------|
| Food & Beverage | `food`, `beverage`, `restaurant`, `cafe`, `bar` |
| Retail | `retail`, `fashion`, `beauty`, `home` |
| Services | `service`, `salon`, `fitness`, `healthcare` |
| Hospitality | `hotel`, `travel`, `tourism` |
| Professional | `office`, `b2b`, `consulting` |
| Local | `local`, `neighborhood`, `small-business` |
| Scale | `solo`, `small-team`, `medium-team` |

---

## 2. Onboarding Chat

### 2.1 Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ONBOARDING CHAT FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   START ──▶ Business? ──▶ Goals? ──▶ Constraints? ──▶ COMPLETE              │
│              │              │            │                │                  │
│              ▼              ▼            ▼                ▼                  │
│          Extract        Extract      Extract         Generate               │
│          industry       goals        constraints     recommendations        │
│          tags                                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 AI Chat Implementation

```typescript
interface OnboardingMessage {
  role: 'assistant' | 'user';
  content: string;
}

interface OnboardingState {
  conversationId: string;
  messages: OnboardingMessage[];
  extractedData: Partial<UserProfile>;
  stage: 'business' | 'goals' | 'constraints' | 'complete';
}

async function processOnboardingMessage(
  state: OnboardingState,
  userMessage: string
): Promise<{
  response: string;
  profileUpdates: Partial<UserProfile>;
  isComplete: boolean;
}> {
  // Add user message to conversation
  state.messages.push({ role: 'user', content: userMessage });

  // Call AI to process and respond
  const aiResponse = await generateOnboardingResponse(state);

  // Extract profile data from conversation
  const profileUpdates = await extractProfileData(state.messages);

  // Check if onboarding is complete
  const isComplete = checkOnboardingComplete(profileUpdates);

  return {
    response: aiResponse,
    profileUpdates,
    isComplete
  };
}
```

### 2.3 Sample Conversation

```
AI: Hi! I'm going to help find the perfect video concepts for your
    business. Tell me about what you do.

User: I run a small coffee shop in Austin, Texas.

AI: A coffee shop in Austin - great! What are you hoping to achieve
    with short-form video content? More foot traffic? Brand awareness?
    Something else?

User: Mainly getting more people through the door. We're in a
    competitive area.

AI: Got it - driving local foot traffic is the goal. One more thing:
    any constraints I should know about? Budget for production,
    number of people available to film, that kind of thing.

User: It's just me running the place, so I need stuff I can film
    myself without a big production.

AI: Perfect! I've got a clear picture now:
    - Coffee shop in Austin
    - Goal: Drive foot traffic
    - Constraint: Solo filming, simple production

    I'll find concepts that work for food businesses, can be filmed
    alone, and drive local traffic. Let's see what matches!
```

### 2.4 Ongoing Chat (Return Visits)

After onboarding, users can return to refine their profile anytime. The chat maintains context and allows incremental updates.

```typescript
interface OngoingChatMessage {
  role: 'assistant' | 'user';
  content: string;
  profileUpdates?: Partial<UserProfile>;
  timestamp: string;
}

async function processOngoingChat(
  userId: string,
  message: string
): Promise<{
  response: string;
  profileUpdates?: Partial<UserProfile>;
  recommendationsAffected: boolean;
}> {
  // Load existing profile and conversation history
  const profile = await getUserProfile(userId);
  const history = profile.onboarding_conversation || [];

  // Add user message
  history.push({
    role: 'user',
    content: message,
    timestamp: new Date().toISOString()
  });

  // Process with context
  const aiResponse = await generateChatResponse(profile, history);
  const profileUpdates = await extractProfileUpdates(aiResponse, profile);

  // Determine if recommendations need refresh
  const recommendationsAffected = Object.keys(profileUpdates || {}).some(
    key => ['goals', 'constraints', 'industryTags'].includes(key)
  );

  return {
    response: aiResponse.content,
    profileUpdates,
    recommendationsAffected
  };
}
```

**Sample Ongoing Chat**:
```
User: Actually, I hired someone last week. We're two people now.

AI: Great news! I'll update your profile - you're no longer solo.
    This opens up some concepts that work better with two people.
    Want me to refresh your recommendations?

User: Yes please

AI: Done! I found 3 new concepts that work great with a duo.
    Check out your dashboard - they're in "New for you".
```

**Mini-Chat (Dashboard Widget)**:

Users can also refine context without leaving the dashboard:

```typescript
interface MiniChatRequest {
  userId: string;
  message: string;
  context?: {
    currentPage: 'dashboard' | 'concept-detail';
    conceptId?: string;  // If viewing a specific concept
  };
}

// Example mini-chat flow:
// User on dashboard: "Show me easier stuff"
// AI: "Got it - filtering for easy-to-film concepts"
// Dashboard refreshes with difficulty filter applied
```

---

## 3. Match Percentage Calculation

### 3.1 Formula

```
matchPercentage = (conceptScore × 0.6) + (profileFitScore × 0.4)
```

| Component | Weight | Description |
|-----------|--------|-------------|
| Concept Score | 60% | Intrinsic quality of the concept (virality potential, creativity, etc.) |
| Profile Fit | 40% | How well concept matches user's profile |

### 3.2 Concept Score Factors

From video analysis (see [Model Training](./06_MODEL_TRAINING.md)):

| Factor | Weight | Source |
|--------|--------|--------|
| Replicability | High | `script.replicability.score` |
| Engagement potential | High | `engagement.shareability` |
| Comedy timing | Medium | `script.humor.comedyTiming` |
| Standalone ability | Medium | `standalone.worksWithoutContext` |
| Trend independence | Medium | Inverse of `trends.memeDependent` |

### 3.3 Profile Fit Score Factors

```typescript
function calculateProfileFit(
  concept: ConceptAnalysis,
  profile: UserProfile
): number {
  let fitScore = 0;

  // Industry match (30% of profile fit)
  const conceptIndustries = concept.flexibility?.industryExamples || [];
  const hasIndustryMatch = profile.industryTags.some(tag =>
    conceptIndustries.some(ind =>
      ind.toLowerCase().includes(tag.toLowerCase())
    )
  );
  fitScore += hasIndustryMatch ? 0.30 : 0.10;

  // Resource constraints match (30% of profile fit)
  const peopleNeeded = concept.casting?.minimumPeople || 1;
  const isSolo = profile.constraints.some(c =>
    c.includes('solo') || c.includes('just me') || c.includes('myself')
  );

  if (isSolo) {
    fitScore += peopleNeeded === 1 ? 0.30 : 0.05;
  } else {
    fitScore += 0.20; // Team available
  }

  // Goal alignment (40% of profile fit)
  const goalFit = assessGoalAlignment(concept, profile.goals);
  fitScore += goalFit * 0.40;

  return Math.min(1, fitScore);
}

function assessGoalAlignment(
  concept: ConceptAnalysis,
  goals: string[]
): number {
  // Map goals to concept attributes
  const goalScores: Record<string, (c: ConceptAnalysis) => number> = {
    'foot traffic': c => c.flexibility?.industryLock < 5 ? 0.8 : 0.4,
    'brand awareness': c => c.engagement?.shareability > 7 ? 0.9 : 0.5,
    'engagement': c => c.engagement?.attentionRetention > 7 ? 0.9 : 0.5,
    'sales': c => c.standalone?.worksWithoutProduct ? 0.3 : 0.7
  };

  let totalScore = 0;
  let matchedGoals = 0;

  for (const goal of goals) {
    for (const [keyword, scorer] of Object.entries(goalScores)) {
      if (goal.toLowerCase().includes(keyword)) {
        totalScore += scorer(concept);
        matchedGoals++;
        break;
      }
    }
  }

  return matchedGoals > 0 ? totalScore / matchedGoals : 0.5;
}
```

---

## 4. Recommendations API

### 4.1 Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RECOMMENDATIONS FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. User requests recommendations                                           │
│   2. Load user profile                                                       │
│   3. Get active listings for user's market                                   │
│   4. For each concept:                                                       │
│      a. Calculate concept score (from model)                                 │
│      b. Calculate profile fit score                                          │
│      c. Combine for match %                                                  │
│      d. Generate "why it fits" reasons                                       │
│   5. Sort by match %                                                         │
│   6. Return top N recommendations                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Implementation

```typescript
async function getRecommendations(
  userId: string,
  options: { page?: number; perPage?: number }
): Promise<RecommendationsResponse> {
  // Load user profile
  const profile = await getUserProfile(userId);
  if (!profile.onboardingComplete) {
    throw new Error('Onboarding not complete');
  }

  // Get user's market
  const market = await getUserMarket(userId);

  // Get active concepts
  const activeConcepts = await getActiveConceptsForMarket(market.id);

  // Calculate match % for each
  const withMatch = await Promise.all(
    activeConcepts.map(async concept => {
      const conceptScore = await getConceptScore(concept.id);
      const profileFit = calculateProfileFit(concept.analysis, profile);
      const matchPercentage = Math.round(
        (conceptScore * 0.6 + profileFit * 0.4) * 100
      );

      const whyItFits = generateFitReasons(concept.analysis, profile);
      const quickFacts = generateQuickFacts(concept.analysis);

      return {
        ...concept,
        matchPercentage,
        whyItFits,
        quickFacts
      };
    })
  );

  // Sort by match % descending
  withMatch.sort((a, b) => b.matchPercentage - a.matchPercentage);

  // Paginate
  const start = (options.page || 0) * (options.perPage || 10);
  const paginated = withMatch.slice(start, start + (options.perPage || 10));

  return {
    recommendations: paginated,
    pagination: {
      page: options.page || 0,
      perPage: options.perPage || 10,
      total: withMatch.length,
      totalPages: Math.ceil(withMatch.length / (options.perPage || 10))
    }
  };
}
```

---

## 5. Plain Language Generation

### 5.1 "Why It Fits" Reasons

```typescript
function generateFitReasons(
  analysis: ConceptAnalysis,
  profile: UserProfile
): string[] {
  const reasons: string[] = [];

  // Industry fit
  const industries = analysis.flexibility?.industryExamples || [];
  const matchedIndustry = profile.industryTags.find(tag =>
    industries.some(i => i.toLowerCase().includes(tag))
  );
  if (matchedIndustry) {
    reasons.push(`Works great for ${matchedIndustry} businesses`);
  }

  // Resource fit
  const peopleNeeded = analysis.casting?.minimumPeople || 1;
  if (peopleNeeded === 1) {
    reasons.push('You can film this yourself');
  } else {
    reasons.push(`Works with ${peopleNeeded} people`);
  }

  // Goal fit
  if (analysis.standalone?.worksWithoutContext > 7) {
    reasons.push('Perfect for driving local traffic');
  }
  if (analysis.engagement?.shareability > 7) {
    reasons.push('High share potential for brand awareness');
  }

  // Simplicity
  if (analysis.production?.shotComplexity <= 3) {
    reasons.push('Simple to produce');
  }

  return reasons.slice(0, 3); // Max 3 reasons
}
```

### 5.2 Quick Facts

```typescript
interface QuickFacts {
  peopleNeeded: string;
  filmTime: string;
  difficulty: string;
}

function generateQuickFacts(analysis: ConceptAnalysis): QuickFacts {
  const people = analysis.casting?.minimumPeople || 1;
  const complexity = analysis.production?.shotComplexity || 5;
  const time = analysis.production?.timeToRecreate || '30min';

  return {
    peopleNeeded: people === 1 ? 'Just you' : `${people} people`,
    filmTime: time.includes('min') ? time : `About ${time}`,
    difficulty: complexity <= 3 ? 'Easy to film' :
                complexity <= 6 ? 'Moderate' : 'More involved'
  };
}
```

---

## 6. Database Tables

See [Database Schema](./02_DATABASE_SCHEMA.md) for full definitions:

- `user_profiles` - User profile data from onboarding
- `concepts` - Concept analysis and scores
- `listing_windows` - Active listings

---

## 7. API Endpoints

See [API Endpoints](./05_API_ENDPOINTS.md) for full specifications:

- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile
- `POST /api/profile/onboarding` - AI onboarding chat
- `GET /api/recommendations` - Get personalized recommendations
- `POST /api/model/match` - Calculate match % for specific concept

---

## Related Documents

- [Model Training Deep Dive](./06_MODEL_TRAINING.md) - Concept scoring
- [Pricing Logic Deep Dive](./03_PRICING_LOGIC.md) - Match-based pricing
- [API Endpoints Deep Dive](./05_API_ENDPOINTS.md) - Recommendations API
- [Interface Documentation](../interface/README.md) - User-facing patterns

---

*This document provides exhaustive detail on the profile and matching system. Refer to specific component documents for related systems.*
