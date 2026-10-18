import { readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadElementStores } from '../src/utils/mobileElementStore.js';

async function findStores(path: string): Promise<string[]> {
  const info = await stat(path);
  if (!info.isDirectory()) {
    if (!/\.ya?ml$/i.test(path)) throw new Error(`Expected a .yml or .yaml file: ${path}`);
    return [path];
  }
  const files: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await findStores(child));
    else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) files.push(child);
  }
  return files.sort();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const paths = args.length ? args.map(path => resolve(path))
    : [fileURLToPath(new URL('../src/elements/', import.meta.url))];
  const files = new Set<string>();
  let failed = false;
  for (const path of paths) {
    try {
      const found = await findStores(path);
      if (!found.length) throw new Error(`No YAML element stores found in ${path}`);
      for (const file of found) files.add(file);
    } catch (error) {
      console.error(`FAIL ${path}: ${error instanceof Error ? error.message : String(error)}`);
      failed = true;
    }
  }
  for (const file of files) {
    try {
      for (const store of await loadElementStores(file)) {
        console.log(`PASS ${file}: ${store.screen}, ${Object.keys(store.elements).length} elements`);
      }
    } catch (error) {
      console.error(`FAIL ${file}: ${error instanceof Error ? error.message : String(error)}`);
      failed = true;
    }
  }
  if (failed) process.exitCode = 1;
}

await main();
