import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const roots = [
  'src/components/admin',
  'src/lib/admin',
  'src/app/admin',
  'src/app/api/admin',
];

const mojibakeFragments = [0xc3, 0xc2, 0xe2].map((code) => String.fromCharCode(code));
const bannedPatterns = [/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/];

function collectSourceFiles(directory: string): string[] {
  const absoluteDirectory = resolve(process.cwd(), directory);
  const entries = readdirSync(absoluteDirectory);

  return entries.flatMap((entry) => {
    const relativePath = `${directory}/${entry}`;
    const absolutePath = resolve(process.cwd(), relativePath);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      return collectSourceFiles(relativePath);
    }

    if (/\.(ts|tsx)$/.test(entry)) {
      return [relativePath];
    }

    return [];
  });
}

describe('admin hygiene guard', () => {
  const files = roots
    .flatMap((root) => collectSourceFiles(root))
    .filter((filePath) => filePath !== 'src/lib/admin/admin-hygiene.test.ts');

  it.each(files)('avoids mojibake and UTC date-slice defaults: %s', (filePath) => {
    const content = readFileSync(resolve(process.cwd(), filePath), 'utf8');

    for (const pattern of bannedPatterns) {
      expect(content).not.toMatch(pattern);
    }

    for (const fragment of mojibakeFragments) {
      expect(content).not.toContain(fragment);
    }
  });
});
