# GCS Video Access Setup

This guide explains how to access video clips from any codespace instance.

## Solution: Signed URLs (Secure & Portable)

Videos are securely accessible using time-limited signed URLs that work across any environment.

---

## Quick Start

### Option 1: Export Dataset with Signed URLs (Recommended)

Generate a JSON export with embedded signed URLs that work for 7 days:

```bash
node scripts/export-with-signed-urls.js
```

**Custom expiration:**
```bash
node scripts/export-with-signed-urls.js --days=30  # URLs valid for 30 days
```

**Output:** `exports/dataset_with_urls_YYYY-MM-DD.json`

Each video will have:
- `gcs_uri` - Original GCS path
- `video_player_url` - Signed URL (works in any browser/codespace)
- `url_expires_at` - Expiration timestamp

---

### Option 2: Generate URLs On-Demand via API

**Single video:**
```bash
curl "http://localhost:3000/api/video-url?gcs_uri=gs://hagen-video-analysis/videos/abc123.mp4&expires_in_days=7"
```

**Response:**
```json
{
  "success": true,
  "url": "https://storage.googleapis.com/hagen-video-analysis/videos/abc123.mp4?X-Goog-Algorithm=...",
  "expires_in_days": 7
}
```

**Batch generation (POST):**
```bash
curl -X POST http://localhost:3000/api/video-url \
  -H "Content-Type: application/json" \
  -d '{
    "gcs_uris": [
      "gs://hagen-video-analysis/videos/video1.mp4",
      "gs://hagen-video-analysis/videos/video2.mp4"
    ],
    "expires_in_days": 7
  }'
```

---

## Usage in Code

### TypeScript/JavaScript

```typescript
import { getSignedVideoUrl, getSignedVideoUrls } from '@/lib/gcs/video-access';

// Single video
const url = await getSignedVideoUrl('gs://hagen-video-analysis/videos/abc123.mp4', {
  expiresInDays: 7
});

// Multiple videos
const gcsUris = [...]; // Array of gs:// URIs
const urlMap = await getSignedVideoUrls(gcsUris, { expiresInDays: 7 });
```

### Python (in another codespace)

```python
import requests
import json

# Load the exported dataset
with open('dataset_with_urls_2025-12-16.json') as f:
    data = json.load(f)

# Access videos directly
for video in data['videos']:
    if 'video_player_url' in video:
        # Video URL works directly in any HTTP client
        response = requests.head(video['video_player_url'])
        print(f"Video accessible: {response.status_code == 200}")
```

---

## Architecture

### Current Setup

```
┌─────────────────────────────────────────────────────────────────┐
│                    GCS Bucket (Private)                          │
│              gs://hagen-video-analysis/videos/                   │
│                                                                   │
│  - Videos stored securely                                        │
│  - Not publicly accessible                                       │
│  - Requires authentication                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Signed URL Generator                           │
│               (Service Account Credentials)                      │
│                                                                   │
│  - Generates time-limited URLs                                   │
│  - No public bucket policy needed                                │
│  - Works from any network/codespace                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Signed URL (Valid 7 days)                    │
│   https://storage.googleapis.com/bucket/video.mp4?X-Goog-...    │
│                                                                   │
│  ✅ Works in browsers, video players, curl, Python, etc.         │
│  ✅ No authentication needed (URL contains signed token)         │
│  ✅ Expires automatically for security                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/gcs/video-access.ts` | Core utilities for signed URL generation |
| `src/app/api/video-url/route.ts` | HTTP API for generating URLs on-demand |
| `scripts/export-with-signed-urls.js` | Batch export script with pre-generated URLs |

---

## FAQ

### How long do signed URLs last?
Default: 7 days. Configurable up to 7 days max for v4 signed URLs.

### Do I need to install anything in the other codespace?
No! Signed URLs work as regular HTTPS URLs. Just load the JSON and use the `video_player_url` field.

### What if URLs expire?
Re-run the export script or use the `/api/video-url` endpoint to generate fresh URLs.

### Can I make the bucket public instead?
Yes, but NOT recommended:
```bash
gsutil iam ch allUsers:objectViewer gs://hagen-video-analysis
```
This makes ALL videos publicly accessible forever.

### What about costs?
Signed URLs don't incur extra costs. You only pay for:
- GCS storage (existing)
- Egress bandwidth (when videos are downloaded/streamed)

---

## Troubleshooting

### "Video not found" error
- Check the GCS URI is correct
- Verify the file exists: `gsutil ls gs://hagen-video-analysis/videos/`

### "Permission denied" error
- Verify `GOOGLE_APPLICATION_CREDENTIALS` is set in `.env.local`
- Check service account has `Storage Object Viewer` role

### URLs not working in other codespace
- Ensure you copied the full `video_player_url` (very long URL with signature)
- Check URL hasn't expired (see `url_expires_at` field)
- Try generating fresh URLs with the export script

---

## Next Steps

1. **Run the export**: `node scripts/export-with-signed-urls.js`
2. **Copy the JSON** to your other codespace
3. **Access videos** using the `video_player_url` field

No additional setup needed in the other codespace! 🎉
