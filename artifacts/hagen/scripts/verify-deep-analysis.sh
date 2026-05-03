#!/bin/bash

# Deep Analysis Setup Verification Script
# Run this after setting up your Gemini API key

echo "🔍 Checking Deep Analysis Setup..."
echo ""

# Check yt-dlp
echo "1. Checking yt-dlp..."
if command -v yt-dlp &> /dev/null; then
    VERSION=$(yt-dlp --version)
    echo "   ✅ yt-dlp installed (version: $VERSION)"
else
    echo "   ❌ yt-dlp not found"
    echo "      Install: sudo apt install yt-dlp"
    exit 1
fi

# Check ffmpeg (used by yt-dlp)
echo ""
echo "2. Checking ffmpeg..."
if command -v ffmpeg &> /dev/null; then
    echo "   ✅ ffmpeg installed"
else
    echo "   ⚠️  ffmpeg not found (optional, but recommended)"
    echo "      Install: sudo apt install ffmpeg"
fi

# Check Node packages
echo ""
echo "3. Checking Node.js packages..."
cd /workspaces/hagen

if npm list @google-cloud/storage &> /dev/null; then
    echo "   ✅ @google-cloud/storage installed"
else
    echo "   ❌ @google-cloud/storage not found"
    echo "      Install: npm install @google-cloud/storage"
    exit 1
fi

if npm list @google/generative-ai &> /dev/null; then
    echo "   ✅ @google/generative-ai installed"
else
    echo "   ❌ @google/generative-ai not found"
    echo "      Install: npm install @google/generative-ai"
    exit 1
fi

# Check environment variables
echo ""
echo "4. Checking environment variables..."
source .env.local 2>/dev/null

if [ -n "$GEMINI_API_KEY" ] && [ "$GEMINI_API_KEY" != "your_gemini_api_key_here" ]; then
    echo "   ✅ GEMINI_API_KEY set"
else
    echo "   ❌ GEMINI_API_KEY not set or using placeholder"
    echo "      1. Get key from: https://makersuite.google.com/app/apikey"
    echo "      2. Add to .env.local: GEMINI_API_KEY=your_key"
    echo "      3. Restart dev server: pkill -f next && npm run dev"
    exit 1
fi

if [ -n "$SUPADATA_API_KEY" ]; then
    echo "   ✅ SUPADATA_API_KEY set"
else
    echo "   ⚠️  SUPADATA_API_KEY not set"
fi

if [ -n "$OPENAI_API_KEY" ]; then
    echo "   ✅ OPENAI_API_KEY set"
else
    echo "   ⚠️  OPENAI_API_KEY not set"
fi

# Check if dev server is running
echo ""
echo "5. Checking dev server..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "   ✅ Dev server running on http://localhost:3000"
    
    # Test the deep analysis API
    echo ""
    echo "6. Testing deep analysis API..."
    RESPONSE=$(curl -s http://localhost:3000/api/videos/analyze/deep)
    
    if echo "$RESPONSE" | grep -q '"available":true'; then
        echo "   ✅ Deep analysis API ready!"
        echo ""
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    else
        echo "   ⚠️  Deep analysis API not fully configured"
        echo ""
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    fi
else
    echo "   ❌ Dev server not running"
    echo "      Start it: npm run dev"
    exit 1
fi

echo ""
echo "✨ Setup verification complete!"
echo ""
echo "📚 Next steps:"
echo "   1. Go to http://localhost:3000/feedback"
echo "   2. Analyze a TikTok video"
echo "   3. Add the DeepAnalysisButton to rate it deeply"
echo ""
echo "📖 See QUICKSTART_DEEP_ANALYSIS.md for usage examples"
