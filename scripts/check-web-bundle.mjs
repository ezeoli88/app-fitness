import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await files(full));
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

const root = path.resolve('dist');
const bundles = await files(root);
const forbidden = ['expo-sqlite', 'expo-notifications', 'expo-splash-screen'];
const hits = [];
for (const file of bundles) {
  const text = await readFile(file, 'utf8');
  for (const name of forbidden) {
    if (text.includes(name)) hits.push(`${file} contiene ${name}`);
  }
}
if (hits.length > 0) {
  console.error(hits.join('\n'));
  process.exit(1);
}
console.log(`Bundle web revisado (${bundles.length} archivos).`);
