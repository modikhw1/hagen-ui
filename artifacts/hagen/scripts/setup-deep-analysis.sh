#!/bin/bash

# Quick setup script for Deep Video Analysis
# This will guide you through getting your Gemini API key

echo "🎬 Deep Video Analysis Setup"
echo "============================="
echo ""
echo "You need a Gemini API key to enable deep video analysis."
echo ""
echo "📋 Steps:"
echo ""
echo "1. Get your Gemini API key:"
echo "   → Open: https://makersuite.google.com/app/apikey"
echo "   → Click 'Get API Key' or 'Create API key in new project'"
echo "   → Copy the key (starts with AIza...)"
echo ""
echo "2. Add it to your environment:"
read -p "   Paste your Gemini API key here: " GEMINI_KEY
echo ""

if [ -z "$GEMINI_KEY" ]; then
    echo "❌ No key provided. Setup cancelled."
    exit 1
fi

# Update .env.local
cd /workspaces/hagen
if grep -q "GEMINI_API_KEY=your_gemini_api_key_here" .env.local; then
    sed -i "s/GEMINI_API_KEY=your_gemini_api_key_here/GEMINI_API_KEY=$GEMINI_KEY/" .env.local
    echo "✅ API key added to .env.local"
elif grep -q "GEMINI_API_KEY=" .env.local; then
    sed -i "s/GEMINI_API_KEY=.*/GEMINI_API_KEY=$GEMINI_KEY/" .env.local
    echo "✅ API key updated in .env.local"
else
    echo "" >> .env.local
    echo "# Gemini API Key" >> .env.local
    echo "GEMINI_API_KEY=$GEMINI_KEY" >> .env.local
    echo "✅ API key added to .env.local"
fi

echo ""
echo "3. Restarting dev server..."
pkill -f next 2>/dev/null
sleep 2
npm run dev > /dev/null 2>&1 &
echo "   ⏳ Waiting for server to start..."
sleep 5

echo ""
echo "4. Verifying setup..."
./scripts/verify-deep-analysis.sh

echo ""
echo "✨ Setup complete!"
echo ""
echo "🚀 Try it out:"
echo "   1. Visit http://localhost:3000/feedback"
echo "   2. Analyze a TikTok video"
echo "   3. Rate it, then run deep analysis"
echo ""
echo "📖 Full docs: /workspaces/hagen/QUICKSTART_DEEP_ANALYSIS.md"
