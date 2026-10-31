/** @jest-environment node */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
    return [path];
  });
}

const shared = [
  join(root, 'src/db/gymDb.ts'),
  join(root, 'src/db/dietDb.ts'),
  join(root, 'src/db/labsDb.ts'),
  join(root, 'src/db/seed.ts'),
  join(root, 'src/db/settings.ts'),
  join(root, 'src/db/core/driver.ts'),
  join(root, 'src/db/core/queue.ts'),
  ...sourceFiles(join(root, 'src/domain')),
];

const forbidden = /from ['"](?:react-native|react(?:-dom)?|expo(?:-[^'"]*)?|@\/db\/writes|expo-sqlite|vite|@tanstack\/[^'"]+)['"]/;

it('keeps the shared repository free of UI framework imports', () => {
  const offenders = shared.filter((path) => forbidden.test(readFileSync(path, 'utf8')));
  expect(offenders).toEqual([]);
});
