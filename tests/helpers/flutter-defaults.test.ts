import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { encryptSecret } from '../../src/config/secrets.js';

test('canonical scenario and both aliases use iOS 17; runtime settings override demo defaults', async t => {
  const root = await mkdtemp(join(tmpdir(), 'flutter-defaults-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'src/config'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  const encryptionKey = randomBytes(32).toString('base64');
  await writeFile(join(root, 'lambdatest.properties'),
    `demo_Flutter=lt://mock-demo\nAPP_PASSWORD=${encryptSecret('fixture-password', encryptionKey)}\n`);
  for (const file of ['mobileSessionInit.ts', 'properties.ts', 'runner.ts', 'secrets.ts']) {
    await copyFile(new URL(`../../src/config/${file}`, import.meta.url), join(root, 'src/config', file));
  }
  const keys = ['PLATFORM', 'platform', 'version', 'LT_VERSION', 'appId', 'LT_IOS_APP_ID', 'iosAppId', 'LT_APP_ID', 'LT_SCENARIO', 'demo_Flutter', 'APP_PASSWORD', 'APPIUM_SECRETS_KEY'];
  for (const key of keys) {
    const previous = process.env[key];
    delete process.env[key];
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  process.env.APPIUM_SECRETS_KEY = encryptionKey;
  const { appIdFor, deviceDefaults, selectedPlatform, setting } = await import(pathToFileURL(join(root, 'src/config/mobileSessionInit.ts')).href);
  assert.equal(setting('APP_PASSWORD'), 'fixture-password');
  for (const scenario of ['login-logout', 'flutter-login-screen', 'loginAndLogout']) {
    process.env.LT_SCENARIO = scenario;
    assert.equal(selectedPlatform(), 'iOS');
    assert.equal(deviceDefaults('iOS', scenario).version, '17');
    assert.equal(appIdFor('iOS', scenario), 'lt://mock-demo');
  }
  process.env.PLATFORM = 'Android';
  process.env.LT_VERSION = '18';
  process.env.LT_IOS_APP_ID = 'lt://platform-app';
  assert.equal(appIdFor('iOS', 'login-logout'), 'lt://platform-app');
  process.env.appId = 'lt://runtime-override';
  assert.equal(selectedPlatform(), 'Android');
  assert.equal(deviceDefaults('iOS', 'login-logout').version, '18');
  assert.equal(appIdFor('iOS', 'login-logout'), 'lt://runtime-override');
  assert.equal(appIdFor('Android', 'login-logout'), 'lt://runtime-override');
});
