import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'src/components/admin/demos/DemosBoard.tsx',
  'src/components/admin/demos/DemoCard.tsx',
  'src/components/admin/demos/CreateDemoDialog.tsx',
  'src/components/admin/demos/ConvertDemoDialog.tsx',
  'src/components/admin/settings/SettingsForm.tsx',
  'src/app/api/admin/overview/route.ts',
  'src/app/api/admin/overview/metrics/route.ts',
  'src/app/api/admin/overview/attention/route.ts',
  'src/app/api/admin/overview/cm-pulse/route.ts',
  'src/app/api/admin/overview/costs/route.ts',
  'src/lib/admin/copy/demos.ts',
  'src/lib/admin/copy/settings.ts',
  'src/lib/admin/copy/overview.ts',
];

const bannedPatterns = [
  /\bhamta\b/i,
  /\bOkand\b/,
  /\bfran\b/i,
  /\bforlorad\b/i,
  /\bforst\b/i,
  /\bforfallna\b/i,
  /\bkanns\b/i,
  /\bOppnat\b/,
];

describe('supporting flows copy encoding guard', () => {
  it.each(files)('does not contain banned ascii fallback strings: %s', (filePath) => {
    const content = readFileSync(resolve(process.cwd(), filePath), 'utf8');

    for (const pattern of bannedPatterns) {
      expect(content).not.toMatch(pattern);
    }
  });
});
