# Component 09: Cashback Flow Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)
> **Component**: Cashback and Performance Verification System
> **Last Updated**: January 1, 2026

---

## Overview

The cashback system creates a feedback loop: buyers who produce content based on purchased concepts can submit proof of production and receive a 10-15% refund. This generates performance data while incentivizing actual usage.

### UI Treatment: De-Emphasized

> **Important**: Per interface specs, cashback is **de-emphasized in the UI**.
> - NOT: "Get 10% cashback when you film it!"
> - YES: Small footnote: "Film it → get some back"
>
> The primary value proposition is the concept itself, not the rebate. The cashback exists primarily to collect feedback data, not as a marketing feature. See [Interface Documentation](../interface/README.md) for UI guidelines.

---

## WHY CASHBACK EXISTS

### The Feedback Loop Problem

Without cashback, we only know:
- ✅ Which concepts were purchased
- ❌ Which concepts were actually produced
- ❌ How those productions performed

With cashback, we learn:
- ✅ Which concepts were purchased
- ✅ Which concepts were actually produced
- ✅ View counts, engagement on produced content
- ✅ Which markets have active creators (not just browsers)

### Business Value of the Data

```typescript
interface CashbackInsights {
  // From submissions, we learn:
  productionRate: number;        // % of purchases that produce content
  avgTimeToProduction: string;   // How long after purchase?
  performanceByMarket: Record<string, number>; // Which markets create?
  conceptSuccessRate: number;    // Concept → viral content?
}
```

This data is **more valuable than the 10-15% refund cost**.

### Why 10-15%?

| Rate | Problem |
|------|--------|
| 5% | Too low to motivate submission |
| **10-15%** | Meaningful reward, sustainable cost |
| 20%+ | Eats too much margin |

```typescript
const CASHBACK_RANGE = {
  min: 0.10,  // 10% base rate (always paid if verified)
  max: 0.15   // 15% for high-performing content
};

// Example: $10 purchase
// - Base cashback: $1.00
// - High performer: $1.50
```

---

## 1. Cashback Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              CASHBACK FLOW                                               │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│   │ PURCHASE │───▶│ PRODUCE  │───▶│  SUBMIT  │───▶│  VERIFY  │───▶│  REFUND  │         │
│   │          │    │ CONTENT  │    │  PROOF   │    │          │    │          │         │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘         │
│        │               │               │               │               │               │
│        ▼               ▼               ▼               ▼               ▼               │
│   • Pay price     • Create video  • Link to post  • Check match   • Credit 10-15%     │
│   • Get access    • Publish       • Auto-detect   • Pull metrics  • Update pool       │
│   • 30-day claim  • On platform     via URL       • Verify buyer                      │
│                                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                         TIME WINDOW: 30 DAYS FROM PURCHASE                       │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Purchase and Eligibility

### 2.1 Purchase Record

```typescript
interface Transaction {
  id: string;
  concept_id: string;
  buyer_id: string;
  buyer_market: string;
  price: number;
  window_id: string;
  purchased_at: string;
  
  // Cashback fields
  cashback_eligible: boolean;      // Always true initially
  cashback_deadline: string;       // 30 days from purchase
  cashback_submitted: boolean;
  cashback_approved: boolean;
  cashback_amount: number | null;  // Calculated at approval
  cashback_processed_at: string | null;
  produced_content_id: string | null;
}
```

### 2.2 Calculate Eligibility

```typescript
const CASHBACK_WINDOW_DAYS = 30;
const CASHBACK_PERCENTAGE_MIN = 0.10;
const CASHBACK_PERCENTAGE_MAX = 0.15;

function createTransaction(
  conceptId: string,
  buyerId: string,
  buyerMarket: string,
  price: number,
  windowId: string
): Partial<Transaction> {
  const purchasedAt = new Date();
  const cashbackDeadline = new Date(purchasedAt);
  cashbackDeadline.setDate(cashbackDeadline.getDate() + CASHBACK_WINDOW_DAYS);
  
  return {
    concept_id: conceptId,
    buyer_id: buyerId,
    buyer_market: buyerMarket,
    price,
    window_id: windowId,
    purchased_at: purchasedAt.toISOString(),
    cashback_eligible: true,
    cashback_deadline: cashbackDeadline.toISOString(),
    cashback_submitted: false,
    cashback_approved: false,
    cashback_amount: null,
    cashback_processed_at: null,
    produced_content_id: null
  };
}
```

---

## 3. Content Submission

### 3.1 Submission Interface

```typescript
interface ProducedContentSubmission {
  transaction_id: string;        // Which purchase this is for
  platform: 'tiktok' | 'instagram' | 'youtube_shorts';
  post_url: string;              // Link to published content
  post_id?: string;              // Platform-specific ID (extracted)
  submitted_at: string;
  
  // For verification
  buyer_profile_url?: string;    // To verify ownership
  additional_notes?: string;
}

interface ProducedContent {
  id: string;
  transaction_id: string;
  concept_id: string;            // Denormalized for easy lookup
  buyer_id: string;
  platform: string;
  post_url: string;
  post_id: string | null;
  submitted_at: string;
  
  // Verification
  verification_status: 'pending' | 'verified' | 'rejected';
  verified_at: string | null;
  rejection_reason: string | null;
  
  // Performance metrics (populated after verification)
  metrics_fetched_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  
  // Cashback
  cashback_rate: number | null;     // 0.10 to 0.15
  cashback_amount: number | null;
}
```

### 3.2 Submit Produced Content

```typescript
async function submitProducedContent(
  submission: ProducedContentSubmission
): Promise<{ success: boolean; content?: ProducedContent; error?: string }> {
  // Validate transaction exists and is eligible
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', submission.transaction_id)
    .single();
  
  if (txError || !transaction) {
    return { success: false, error: 'Transaction not found' };
  }
  
  // Check deadline
  if (new Date() > new Date(transaction.cashback_deadline)) {
    return { success: false, error: 'Cashback window expired' };
  }
  
  // Check if already submitted
  if (transaction.cashback_submitted) {
    return { success: false, error: 'Cashback already submitted' };
  }
  
  // Extract post ID from URL
  const postId = extractPostId(submission.post_url, submission.platform);
  
  // Create produced content record
  const { data: content, error: insertError } = await supabase
    .from('produced_content')
    .insert({
      transaction_id: submission.transaction_id,
      concept_id: transaction.concept_id,
      buyer_id: transaction.buyer_id,
      platform: submission.platform,
      post_url: submission.post_url,
      post_id: postId,
      submitted_at: new Date().toISOString(),
      verification_status: 'pending'
    })
    .select()
    .single();
  
  if (insertError) {
    return { success: false, error: insertError.message };
  }
  
  // Update transaction
  await supabase
    .from('transactions')
    .update({
      cashback_submitted: true,
      produced_content_id: content.id
    })
    .eq('id', submission.transaction_id);
  
  // Queue for verification
  await queueForVerification(content.id);
  
  return { success: true, content };
}
```

### 3.3 Extract Post ID from URL

```typescript
function extractPostId(url: string, platform: string): string | null {
  try {
    const urlObj = new URL(url);
    
    switch (platform) {
      case 'tiktok':
        // https://www.tiktok.com/@username/video/1234567890123456789
        const tiktokMatch = url.match(/video\/(\d+)/);
        return tiktokMatch ? tiktokMatch[1] : null;
      
      case 'instagram':
        // https://www.instagram.com/reel/AbCdEfG1234/
        const instaMatch = url.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
        return instaMatch ? instaMatch[2] : null;
      
      case 'youtube_shorts':
        // https://youtube.com/shorts/abcdefghijk
        const ytMatch = url.match(/shorts\/([A-Za-z0-9_-]+)/);
        return ytMatch ? ytMatch[1] : null;
      
      default:
        return null;
    }
  } catch {
    return null;
  }
}
```

---

## 4. Verification Process

### 4.1 Verification Checks

```typescript
interface VerificationResult {
  verified: boolean;
  checks: {
    postExists: boolean;
    postPublic: boolean;
    conceptSimilarity: number;      // 0-1 similarity to original concept
    accountMatches: boolean;        // Buyer claims this account
    withinTimeframe: boolean;       // Posted after purchase
  };
  rejectionReason?: string;
}

async function verifyProducedContent(contentId: string): Promise<VerificationResult> {
  const content = await getProducedContent(contentId);
  const transaction = await getTransaction(content.transaction_id);
  const concept = await getConcept(content.concept_id);
  
  const checks = {
    postExists: false,
    postPublic: false,
    conceptSimilarity: 0,
    accountMatches: true,  // Default trust, manual review if flagged
    withinTimeframe: false
  };
  
  // Check 1: Post exists and is public
  try {
    const postData = await fetchPostMetadata(content.post_url, content.platform);
    checks.postExists = postData !== null;
    checks.postPublic = postData?.isPublic ?? false;
    
    // Check post date
    if (postData?.createdAt) {
      checks.withinTimeframe = new Date(postData.createdAt) > new Date(transaction.purchased_at);
    }
  } catch (error) {
    console.error('Failed to fetch post:', error);
  }
  
  // Check 2: Content similarity (basic implementation)
  // This could use video embedding comparison or manual review
  // For MVP, we trust the submission with basic checks
  checks.conceptSimilarity = 0.8; // Placeholder - assume match
  
  // Determine verification result
  const verified = checks.postExists && 
                   checks.postPublic && 
                   checks.withinTimeframe &&
                   checks.conceptSimilarity > 0.5;
  
  let rejectionReason: string | undefined;
  if (!checks.postExists) rejectionReason = 'Post not found or inaccessible';
  else if (!checks.postPublic) rejectionReason = 'Post is not public';
  else if (!checks.withinTimeframe) rejectionReason = 'Post was created before purchase';
  else if (checks.conceptSimilarity < 0.5) rejectionReason = 'Content does not match concept';
  
  return { verified, checks, rejectionReason };
}
```

### 4.2 Process Verification

```typescript
async function processVerification(contentId: string): Promise<void> {
  const result = await verifyProducedContent(contentId);
  
  if (result.verified) {
    // Fetch metrics
    const metrics = await fetchPostMetrics(contentId);
    
    // Calculate cashback rate (10-15% based on performance)
    const cashbackRate = calculateCashbackRate(metrics);
    const content = await getProducedContent(contentId);
    const transaction = await getTransaction(content.transaction_id);
    const cashbackAmount = transaction.price * cashbackRate;
    
    // Update produced content
    await supabase
      .from('produced_content')
      .update({
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        views: metrics.views,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        metrics_fetched_at: new Date().toISOString(),
        cashback_rate: cashbackRate,
        cashback_amount: cashbackAmount
      })
      .eq('id', contentId);
    
    // Update transaction
    await supabase
      .from('transactions')
      .update({
        cashback_approved: true,
        cashback_amount: cashbackAmount
      })
      .eq('id', content.transaction_id);
    
    // Process refund
    await processRefund(content.transaction_id, cashbackAmount);
    
  } else {
    // Rejection
    await supabase
      .from('produced_content')
      .update({
        verification_status: 'rejected',
        verified_at: new Date().toISOString(),
        rejection_reason: result.rejectionReason
      })
      .eq('id', contentId);
  }
}
```

### 4.3 Calculate Cashback Rate

```typescript
interface PerformanceMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

function calculateCashbackRate(metrics: PerformanceMetrics | null): number {
  // Base rate: 10%
  // Max rate: 15%
  
  if (!metrics) return CASHBACK_PERCENTAGE_MIN;
  
  // Performance scoring
  // Higher engagement = higher cashback
  const engagementRate = metrics.views > 0 
    ? (metrics.likes + metrics.comments * 2 + metrics.shares * 3) / metrics.views 
    : 0;
  
  // Tiered system
  if (engagementRate > 0.10) {
    // 10%+ engagement = max cashback
    return CASHBACK_PERCENTAGE_MAX; // 15%
  } else if (engagementRate > 0.05) {
    // 5-10% engagement = 12.5%
    return 0.125;
  } else if (metrics.views > 10000) {
    // High views = 12.5%
    return 0.125;
  } else {
    // Base rate
    return CASHBACK_PERCENTAGE_MIN; // 10%
  }
}
```

---

## 5. Refund Processing

### 5.1 Refund Methods

```typescript
type RefundMethod = 'credits' | 'original_payment' | 'bank_transfer';

interface RefundRequest {
  transaction_id: string;
  amount: number;
  method: RefundMethod;
}

async function processRefund(transactionId: string, amount: number): Promise<void> {
  const transaction = await getTransaction(transactionId);
  
  // For MVP: Credit to account balance
  // Future: Integrate with Stripe for actual refunds
  
  await supabase
    .from('buyer_accounts')
    .update({
      credit_balance: supabase.raw(`credit_balance + ${amount}`)
    })
    .eq('id', transaction.buyer_id);
  
  // Record refund
  await supabase
    .from('cashback_refunds')
    .insert({
      transaction_id: transactionId,
      amount,
      method: 'credits',
      processed_at: new Date().toISOString()
    });
  
  // Update transaction
  await supabase
    .from('transactions')
    .update({
      cashback_processed_at: new Date().toISOString()
    })
    .eq('id', transactionId);
  
  // Notify buyer
  await sendNotification(transaction.buyer_id, {
    type: 'cashback_approved',
    title: 'Cashback Approved!',
    message: `You've received $${amount.toFixed(2)} in credits.`,
    link: '/account/credits'
  });
}
```

### 5.2 Credit Balance

```sql
-- Add credit balance to buyer accounts
ALTER TABLE buyer_accounts ADD COLUMN IF NOT EXISTS credit_balance DECIMAL(10,2) DEFAULT 0;

-- Credits can be used for future purchases
-- Applied automatically at checkout
```

---

## 6. Performance Data Collection

### 6.1 Metrics Update Cycle

```typescript
// Run daily to update metrics on verified content
async function updateContentMetrics(): Promise<void> {
  // Get all verified content from last 30 days
  const { data: content } = await supabase
    .from('produced_content')
    .select('*')
    .eq('verification_status', 'verified')
    .gte('verified_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  
  for (const item of content || []) {
    try {
      const metrics = await fetchPostMetrics(item.id);
      
      await supabase
        .from('produced_content')
        .update({
          views: metrics.views,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          metrics_fetched_at: new Date().toISOString()
        })
        .eq('id', item.id);
      
    } catch (error) {
      console.error(`Failed to update metrics for ${item.id}:`, error);
    }
  }
}
```

### 6.2 Aggregate Performance by Concept

```sql
-- View: Concept performance from produced content
CREATE VIEW concept_performance AS
SELECT 
  c.id as concept_id,
  c.core_mechanic,
  COUNT(pc.id) as produced_count,
  SUM(pc.views) as total_views,
  AVG(pc.views) as avg_views,
  SUM(pc.likes) as total_likes,
  SUM(pc.comments) as total_comments,
  SUM(pc.shares) as total_shares,
  AVG(CASE WHEN pc.views > 0 
      THEN (pc.likes + pc.comments * 2 + pc.shares * 3)::float / pc.views 
      ELSE 0 END) as avg_engagement_rate
FROM concepts c
LEFT JOIN produced_content pc ON c.id = pc.concept_id
WHERE pc.verification_status = 'verified'
GROUP BY c.id, c.core_mechanic;
```

---

## 7. Database Schema

### 7.1 Tables

```sql
-- Produced content submissions
CREATE TABLE produced_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  concept_id UUID NOT NULL REFERENCES concepts(id),
  buyer_id UUID NOT NULL REFERENCES buyer_accounts(id),
  
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube_shorts')),
  post_url TEXT NOT NULL,
  post_id TEXT,
  
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Performance metrics
  metrics_fetched_at TIMESTAMPTZ,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  
  -- Cashback
  cashback_rate DECIMAL(4,2),
  cashback_amount DECIMAL(10,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cashback refund records
CREATE TABLE cashback_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  amount DECIMAL(10,2) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('credits', 'original_payment', 'bank_transfer')),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

-- Indexes
CREATE INDEX idx_produced_content_concept ON produced_content(concept_id);
CREATE INDEX idx_produced_content_status ON produced_content(verification_status);
CREATE INDEX idx_produced_content_buyer ON produced_content(buyer_id);
```

---

## 8. API Endpoints

### 8.1 Submit Cashback Claim

```typescript
// POST /api/cashback/submit
export async function POST(request: Request) {
  const body = await request.json();
  const { transactionId, platform, postUrl, buyerProfileUrl } = body;
  
  // Validate required fields
  if (!transactionId || !platform || !postUrl) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  
  // Validate platform
  if (!['tiktok', 'instagram', 'youtube_shorts'].includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }
  
  // Submit
  const result = await submitProducedContent({
    transaction_id: transactionId,
    platform,
    post_url: postUrl,
    buyer_profile_url: buyerProfileUrl,
    submitted_at: new Date().toISOString()
  });
  
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  
  return NextResponse.json({
    success: true,
    contentId: result.content!.id,
    status: 'pending',
    message: 'Submission received. Verification typically takes 24-48 hours.'
  });
}
```

### 8.2 Check Cashback Status

```typescript
// GET /api/cashback/status/:transactionId
export async function GET(
  request: Request,
  { params }: { params: { transactionId: string } }
) {
  const { data: transaction } = await supabase
    .from('transactions')
    .select(`
      *,
      produced_content (*)
    `)
    .eq('id', params.transactionId)
    .single();
  
  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }
  
  return NextResponse.json({
    transactionId: transaction.id,
    eligible: transaction.cashback_eligible,
    deadline: transaction.cashback_deadline,
    daysRemaining: Math.max(0, Math.ceil(
      (new Date(transaction.cashback_deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    )),
    submitted: transaction.cashback_submitted,
    approved: transaction.cashback_approved,
    amount: transaction.cashback_amount,
    processedAt: transaction.cashback_processed_at,
    content: transaction.produced_content ? {
      id: transaction.produced_content.id,
      status: transaction.produced_content.verification_status,
      platform: transaction.produced_content.platform,
      postUrl: transaction.produced_content.post_url,
      metrics: transaction.produced_content.views ? {
        views: transaction.produced_content.views,
        likes: transaction.produced_content.likes,
        comments: transaction.produced_content.comments,
        shares: transaction.produced_content.shares
      } : null
    } : null
  });
}
```

### 8.3 List Buyer's Cashback History

```typescript
// GET /api/cashback/history
export async function GET(request: Request) {
  const buyerId = await getBuyerIdFromAuth(request);
  
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id,
      purchased_at,
      price,
      cashback_deadline,
      cashback_submitted,
      cashback_approved,
      cashback_amount,
      concept:concepts (
        core_mechanic
      ),
      produced_content (
        verification_status,
        platform,
        views
      )
    `)
    .eq('buyer_id', buyerId)
    .order('purchased_at', { ascending: false });
  
  return NextResponse.json({
    transactions: transactions || [],
    summary: {
      totalPurchases: transactions?.length || 0,
      totalCashbackEarned: transactions?.reduce(
        (sum, t) => sum + (t.cashback_amount || 0), 0
      ) || 0,
      pendingSubmissions: transactions?.filter(
        t => !t.cashback_submitted && new Date(t.cashback_deadline) > new Date()
      ).length || 0
    }
  });
}
```

---

## 9. UI Components

### 9.1 Cashback Submission Form

```tsx
function CashbackSubmitForm({ transactionId, concept }: { 
  transactionId: string; 
  concept: Concept;
}) {
  const [platform, setPlatform] = useState<string>('tiktok');
  const [postUrl, setPostUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const response = await fetch('/api/cashback/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId, platform, postUrl })
    });
    
    const data = await response.json();
    setResult(data);
    setLoading(false);
  };
  
  return (
    <form onSubmit={handleSubmit} className="cashback-form">
      <h3>Claim Your Cashback</h3>
      <p>Submit a link to your produced content based on this concept.</p>
      
      <div className="concept-preview">
        <p><strong>Concept:</strong> {concept.core_mechanic}</p>
      </div>
      
      <div className="form-group">
        <label>Platform</label>
        <select value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram Reels</option>
          <option value="youtube_shorts">YouTube Shorts</option>
        </select>
      </div>
      
      <div className="form-group">
        <label>Post URL</label>
        <input 
          type="url" 
          placeholder={`https://www.${platform}.com/...`}
          value={postUrl}
          onChange={e => setPostUrl(e.target.value)}
          required
        />
        <small>Paste the direct link to your published video</small>
      </div>
      
      <button type="submit" disabled={loading}>
        {loading ? 'Submitting...' : 'Submit for Cashback'}
      </button>
      
      {result && (
        <div className={`result ${result.success ? 'success' : 'error'}`}>
          {result.success ? (
            <>
              <p>✅ Submission received!</p>
              <p>{result.message}</p>
            </>
          ) : (
            <p>❌ {result.error}</p>
          )}
        </div>
      )}
    </form>
  );
}
```

### 9.2 Cashback Status Dashboard

```tsx
function CashbackDashboard() {
  const { data, isLoading } = useCashbackHistory();
  
  if (isLoading) return <Spinner />;
  
  return (
    <div className="cashback-dashboard">
      <div className="summary-cards">
        <SummaryCard 
          title="Total Earned" 
          value={`$${data.summary.totalCashbackEarned.toFixed(2)}`}
          icon="💰"
        />
        <SummaryCard 
          title="Pending Claims" 
          value={data.summary.pendingSubmissions}
          icon="⏳"
        />
      </div>
      
      <div className="transactions-list">
        <h3>Purchase History</h3>
        {data.transactions.map(tx => (
          <TransactionRow key={tx.id} transaction={tx} />
        ))}
      </div>
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: any }) {
  const deadline = new Date(transaction.cashback_deadline);
  const isExpired = deadline < new Date();
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  
  return (
    <div className="transaction-row">
      <div className="concept-info">
        <p>{transaction.concept.core_mechanic}</p>
        <small>Purchased {formatDate(transaction.purchased_at)}</small>
      </div>
      
      <div className="cashback-status">
        {transaction.cashback_approved ? (
          <Badge variant="success">
            Earned ${transaction.cashback_amount.toFixed(2)}
          </Badge>
        ) : transaction.cashback_submitted ? (
          <Badge variant="warning">
            Verification Pending
          </Badge>
        ) : isExpired ? (
          <Badge variant="error">
            Expired
          </Badge>
        ) : (
          <div>
            <Badge variant="info">
              {daysLeft} days left
            </Badge>
            <Link href={`/cashback/submit/${transaction.id}`}>
              Submit Claim
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 10. Notifications

### 10.1 Notification Types

```typescript
const cashbackNotifications = {
  purchase_complete: {
    title: 'Purchase Complete',
    message: 'You have 30 days to claim cashback on this concept.',
    timing: 'immediate'
  },
  deadline_reminder_7d: {
    title: 'Cashback Deadline Approaching',
    message: 'Only 7 days left to claim cashback on your purchase.',
    timing: '7 days before deadline'
  },
  deadline_reminder_1d: {
    title: 'Last Day for Cashback!',
    message: 'Today is the last day to claim cashback on your purchase.',
    timing: '1 day before deadline'
  },
  verification_pending: {
    title: 'Cashback Submitted',
    message: 'Your cashback claim is being verified. This usually takes 24-48 hours.',
    timing: 'on submission'
  },
  cashback_approved: {
    title: 'Cashback Approved!',
    message: 'Congratulations! Your cashback has been credited to your account.',
    timing: 'on approval'
  },
  cashback_rejected: {
    title: 'Cashback Claim Rejected',
    message: 'Unfortunately, your cashback claim was rejected.',
    timing: 'on rejection'
  }
};
```

---

## 11. Analytics and Reporting

### 11.1 Cashback Metrics

```sql
-- Cashback analytics
SELECT 
  DATE_TRUNC('month', t.purchased_at) as month,
  COUNT(*) as total_purchases,
  COUNT(CASE WHEN t.cashback_submitted THEN 1 END) as submissions,
  COUNT(CASE WHEN t.cashback_approved THEN 1 END) as approvals,
  SUM(t.cashback_amount) as total_cashback_paid,
  AVG(t.cashback_amount) as avg_cashback,
  (COUNT(CASE WHEN t.cashback_submitted THEN 1 END)::float / COUNT(*)::float) * 100 as submission_rate,
  (COUNT(CASE WHEN t.cashback_approved THEN 1 END)::float / 
   NULLIF(COUNT(CASE WHEN t.cashback_submitted THEN 1 END), 0)::float) * 100 as approval_rate
FROM transactions t
GROUP BY DATE_TRUNC('month', t.purchased_at)
ORDER BY month DESC;
```

---

## Related Documents

- [Pricing Logic Deep Dive](./03_PRICING_LOGIC.md) - Purchase prices
- [Database Schema Deep Dive](./02_DATABASE_SCHEMA.md) - Table definitions
- [API Endpoints Deep Dive](./05_API_ENDPOINTS.md) - All API routes

---

*This document provides exhaustive detail on the cashback system. Refer to specific component documents for related systems.*
