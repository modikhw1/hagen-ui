import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { translateClipToConcept } from '@/lib/translator';
import type { BackendClip, ClipOverride } from '@/lib/translator';

// ─────────────────────────────────────────────
// POST /api/admin/concepts/translate-vertex
//
// Translates raw Vertex AI output (BackendClip) into
// structured concept fields ready for the UI / DB storage.
//
// Body: { clip: BackendClip; override?: ClipOverride }
//
// Response: translated concept fields (category keys + Swedish fields)
// ─────────────────────────────────────────────

export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { clip, override } = body as { clip: BackendClip; override?: ClipOverride };

  if (!clip || !clip.id) {
    return NextResponse.json(
      { error: 'clip with an id field is required' },
      { status: 400 },
    );
  }

  const translated = translateClipToConcept(clip, override);

  // Return both the translated concept and a flat summary of the
  // category keys so callers can easily populate individual fields.
  return NextResponse.json({
    concept: translated,
    fields: {
      difficulty: translated.difficulty,
      filmTime: translated.filmTime,
      peopleNeeded: translated.peopleNeeded,
      mechanism: translated.mechanism,
      market: translated.market,
      trendLevel: translated.trendLevel,
      vibeAlignments: translated.vibeAlignments,
      whyItFits: translated.whyItFits,
      headline: translated.headline,
      headline_sv: translated.headline_sv ?? null,
      description_sv: translated.description_sv ?? null,
      whyItWorks_sv: translated.whyItWorks_sv ?? null,
      script_sv: translated.script_sv ?? null,
      productionNotes_sv: translated.productionNotes_sv ?? null,
      whyItFits_sv: translated.whyItFits_sv ?? null,
    },
  });
}, ['admin', 'content_manager']);
