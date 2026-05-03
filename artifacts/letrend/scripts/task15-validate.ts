import fs from 'node:fs';
import { translateClipToConcept } from '../src/lib/translator';
import { conceptFieldConstraints, validateConceptField } from '../src/lib/concept-field-constraints';
import { detectTranscriptLanguage } from '../src/lib/transcript-language';

const data = JSON.parse(fs.readFileSync('src/data/clips-priority.json', 'utf8'));
const clips = (Array.isArray(data) ? data : data.clips || []).slice(0, 6);

let pass = 0, fail = 0;
for (const clip of clips) {
  const t = translateClipToConcept(clip);
  const lang = detectTranscriptLanguage(t.script_sv);
  console.log(`\n[${clip.id}]`);
  console.log(`  headline (${t.headline_sv?.length ?? 0}): ${t.headline_sv}`);
  console.log(`  description (${t.description_sv?.length ?? 0}): ${(t.description_sv ?? '').slice(0, 80)}…`);
  console.log(`  whyItWorks (${t.whyItWorks_sv?.length ?? 0}): ${(t.whyItWorks_sv ?? '').slice(0, 80)}…`);
  console.log(`  script (${t.script_sv?.length ?? 0} chars, lang=${lang})`);
  console.log(`  classify: ${t.difficulty}/${t.filmTime}/${t.peopleNeeded}/${t.estimatedBudget} biz=${t.businessTypes.join(',')}`);

  for (const field of ['headline_sv','description_sv','whyItWorks_sv','script_sv'] as const) {
    const err = validateConceptField(field, t[field] ?? '');
    if (err) { console.log(`    ⚠️ ${err}`); fail++; }
    else pass++;
  }
}
console.log(`\n=== ${pass} field-checks passed, ${fail} failed across ${clips.length} clips ===`);
