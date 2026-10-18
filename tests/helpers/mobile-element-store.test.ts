import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loadElementStore, parseElementStore, parseElementStores } from '../../src/utils/mobileElementStore.js';

const path = new URL('../../src/elements/login.yml', import.meta.url);
const source = await readFile(path, 'utf8');

test('login and home YAML contain all current elements and assertions', async () => {
  const login = await loadElementStore(path, 'LoginScreen and WelcomeScreen');
  const home = await loadElementStore(path, 'Home Screen');
  assert.deepEqual(Object.keys(login.elements), [
    'welcomeMessage', 'logo', 'description', 'usernameField', 'passwordField', 'loginButton'
  ]);
  assert.equal(Object.keys(home.elements).length, 8);
  assert.equal(Object.values(login.elements).filter(element => element.validation).length, 3);
  assert.equal(Object.values(home.elements).filter(element => element.validation).length, 7);
});

test('multi-screen selection is explicit and validates every document', () => {
  assert.equal(parseElementStores(source).length, 2);
  assert.throws(() => parseElementStore(source), /Specify a screen/);
  assert.throws(() => parseElementStore(source, 'missing'), /Missing screen/);
  assert.throws(() => parseElementStores(`${source}\n---\nversion: 1\nscreen: Home Screen\nelements: {}`), /non-empty mapping/);
  const home = source.slice(source.indexOf('---') + 4);
  assert.throws(() => parseElementStores(`${source}\n---\n${home}`), /Duplicate screen/);
  assert.throws(() => parseElementStore(`${source}\n---\ninvalid: [`, 'Home Screen'), /Invalid YAML/);
});

test('offline CLI validates both YAML documents without a mobile session', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/validate-elements.ts'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS .*LoginScreen and WelcomeScreen, 6 elements/);
  assert.match(result.stdout, /PASS .*Home Screen, 8 elements/);
});
