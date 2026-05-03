/**
 * Lightweight language tagging for transcripts and concept fields.
 * Used by the review UI (Step 4 of Task #15) to show CMs whether the source
 * transcript is Swedish, English or other before they translate / rewrite.
 *
 * Heuristic-only — we do not call a model. False positives are tolerable
 * because the tag is informational.
 */

export type TranscriptLanguage = 'sv' | 'en' | 'mixed' | 'other' | 'empty';

const SWEDISH_STOPWORDS = [
  'och', 'att', 'det', 'som', 'är', 'inte', 'för', 'på', 'med', 'jag',
  'vi', 'du', 'har', 'kan', 'man', 'men', 'från', 'eller', 'när', 'så',
  'vad', 'där', 'här', 'mig', 'dig', 'mer', 'över', 'under', 'några', 'bara',
];

const ENGLISH_STOPWORDS = [
  'the', 'and', 'to', 'of', 'a', 'in', 'is', 'it', 'you', 'that',
  'for', 'on', 'with', 'as', 'this', 'but', 'be', 'have', 'are', 'was',
  'they', 'we', 'i', 'just', 'so', 'like', 'because', 'when', 'about', 'going',
];

function countMatches(tokens: string[], dict: string[]): number {
  const set = new Set(dict);
  let n = 0;
  for (const tok of tokens) if (set.has(tok)) n += 1;
  return n;
}

export function detectTranscriptLanguage(text: string | undefined | null): TranscriptLanguage {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return 'empty';

  const tokens = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return 'empty';

  const sv = countMatches(tokens, SWEDISH_STOPWORDS);
  const en = countMatches(tokens, ENGLISH_STOPWORDS);
  const hasSwedishLetters = /[åäöÅÄÖ]/.test(trimmed);

  // Strong Swedish signals
  if (hasSwedishLetters && sv >= 2) return 'sv';
  if (sv >= 4 && sv > en * 1.5) return 'sv';

  // Strong English signals
  if (en >= 4 && en > sv * 1.5) return 'en';

  // Mixed if both have some signal
  if (sv >= 2 && en >= 2) return 'mixed';
  if (en >= 2) return 'en';
  if (sv >= 2 || hasSwedishLetters) return 'sv';

  return 'other';
}

export function describeTranscriptLanguage(lang: TranscriptLanguage): { label: string; color: string; bg: string } {
  switch (lang) {
    case 'sv':    return { label: '🇸🇪 Svenska',  color: '#1d4ed8', bg: '#dbeafe' };
    case 'en':    return { label: '🇬🇧 Engelska', color: '#9a3412', bg: '#ffedd5' };
    case 'mixed': return { label: '🌐 Blandat',   color: '#6d28d9', bg: '#ede9fe' };
    case 'other': return { label: '❓ Okänt språk', color: '#6b7280', bg: '#f3f4f6' };
    case 'empty': return { label: '— Inget transkript', color: '#9ca3af', bg: '#f9fafb' };
  }
}
