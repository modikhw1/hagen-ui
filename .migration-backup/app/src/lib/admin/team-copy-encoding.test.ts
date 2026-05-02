import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'src/app/admin/team/page.tsx',
  'src/components/admin/team/TeamMemberCard.tsx',
  'src/components/admin/team/CMEditDialog.tsx',
  'src/components/admin/team/CMAbsenceModal.tsx',
  'src/components/admin/team/AddCMDialog.tsx',
  'src/components/admin/customers/modals/ChangeCMModal.tsx',
  'src/lib/admin/copy/team.ts',
];

const bannedPatterns = [
  /\bfranvaro\b/i,
  /\bFoljare\b/,
  /\bFlode\b/,
  /\bLagg till\b/,
  /\bOvrigt\b/,
  /\bForaldraledig\b/,
  /\bAndra\b/,
  /\btillfallig\b/i,
  /\bTackning\b/,
];

describe('team copy encoding guard', () => {
  it.each(files)('does not contain banned ascii fallback strings: %s', (filePath) => {
    const content = readFileSync(resolve(process.cwd(), filePath), 'utf8');

    for (const pattern of bannedPatterns) {
      expect(content).not.toMatch(pattern);
    }
  });
});
