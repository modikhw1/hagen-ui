# Hagen

AI-powered video humor analysis platform. Analyzes TikTok videos to understand comedic mechanisms, timing, and audience targeting.

## What It Does

- **Video Analysis**: Downloads and analyzes TikTok videos using fine-tuned Gemini models
- **Humor Mechanism Detection**: Identifies subversion, irony, timing, wordplay, and other comedic techniques
- **Fine-Tuning Pipeline**: Tools to create training data and fine-tune models for humor understanding
- **Replicability Assessment**: Evaluates how reproducible a viral format is for brand content

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Google Vertex AI** - Fine-tuned Gemini 2.5 Flash models
- **Google Cloud Storage** - Video storage for analysis
- **Supabase** - Database and authentication
- **Tailwind CSS** - Styling

## Core Features

### Video Analysis (`/api/videos/analyze`)
Analyzes TikTok videos for:
- **Handling** - What happens in the video
- **Mekanism** - Comedy mechanism used (subversion, recognition, contrast, etc.)
- **Varför** - Why it's funny (psychological/social explanation)
- **Målgrupp** - Target audience

### Fine-Tuning Lab (`/fine-tuning-lab`)
Active learning interface for:
- Generating draft analyses with tuned models
- Human review and correction
- Building gold standard training datasets
- Batch processing multiple videos

### Model Versions
- **v5**: 345 examples (246 TikTok + 99 Simpsons)
- **v6**: 659 examples (246 TikTok + 413 Simpsons)

## Project Structure

```
hagen/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── videos/analyze/     # Main video analysis
│   │   │   └── fine-tuning/        # Fine-tuning endpoints
│   │   ├── fine-tuning-lab/        # Training data UI
│   │   └── replicability-lab/      # Replicability testing
│   └── lib/
│       └── services/
│           ├── video/              # Download, storage, analysis
│           └── gemini/             # Gemini API integration
├── datasets/
│   ├── fine-tuning/                # Training data
│   │   ├── gold_standard.jsonl     # Verified examples
│   │   ├── model_versions.json     # Model registry
│   │   └── v7-planning.md          # Next version planning
│   └── simpsons-scripts/           # Simpsons comedy mining
└── scripts/                        # Data processing scripts
```

## Getting Started

### Prerequisites
- Node.js 18+
- Google Cloud project with Vertex AI enabled
- Supabase account

### Environment Variables
```env
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
GCS_BUCKET_NAME=your-bucket
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
```

### Run Development Server
```bash
npm install
npm run dev
```

## Fine-Tuning Workflow

1. **Collect Videos**: Use Fine-Tuning Lab to process TikTok URLs
2. **Generate Drafts**: Model produces initial analysis
3. **Human Review**: Approve, edit, or refine analysis
4. **Build Dataset**: Corrections become training data
5. **Train Model**: Run fine-tuning job on Vertex AI
6. **Evaluate**: Test new model version

## Training Data Sources

- **TikTok Videos**: Direct video analysis with human corrections
- **Simpsons Scripts**: Comedy beat extraction for mechanism patterns
- **Meta-Observation Examples**: Teaching when to look deeper (background gags, audio contrast)
- **Multi-Interpretation Examples**: Disambiguating wordplay via visual evidence

## License

Private repository.
