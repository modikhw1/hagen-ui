# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Repository Purpose

This is the **MVP frontend** for the TikTok concept marketplace. It contains a Next.js app with basic flows for validating the core product idea.

## Repository Structure

```
hagen-ui/
├── app/              # Next.js application
│   ├── src/
│   │   ├── app/      # Routes
│   │   ├── components/
│   │   ├── mocks/    # Mock data
│   │   └── types/
│   └── public/
├── Outline.md        # MVP feature outline
└── CLAUDE.md
```

## Quick Start

```bash
cd app
npm install
npm run dev
```

## Related Repos

- **hagen** - Backend with Gemini video analysis, Claude brand profiling, Supabase
- **letrend-docs** - Full vision documentation, training data, specifications (170+ features schema)

## MVP Focus

This repo is intentionally simple. For the full vision with AI matching, brand profiles, and marketplace features, see `letrend-docs`.

Current MVP scope:
- Landing page
- Basic onboarding
- Dashboard with concept listings
- Concept detail view
- User profile
