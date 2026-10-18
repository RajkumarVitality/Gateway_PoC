import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { sessionAppIdentifier } from '../../src/utils/mobileAppCleanup.js';

test('discovers identifiers from capabilities, active iOS app, and Android package', async () => {
  _setGlobal('browser', { capabilities: { 'appium:bundleId': 'com.example.demo' } });
  assert.equal(await sessionAppIdentifier('iOS'), 'com.example.demo');
  _setGlobal('browser', { capabilities: {}, execute: async () => ({ bundleId: 'com.example.active' }) });
  assert.equal(await sessionAppIdentifier('iOS'), 'com.example.active');
  _setGlobal('browser', { capabilities: {}, getCurrentPackage: async () => 'com.example.android' });
  assert.equal(await sessionAppIdentifier('Android'), 'com.example.android');
});

test('missing/system IDs and driver failures surface explicitly', async () => {
  for (const bundleId of [undefined, 'com.apple.springboard']) {
    _setGlobal('browser', { capabilities: {}, execute: async () => ({ bundleId }) });
    await assert.rejects(sessionAppIdentifier('iOS'), /Cannot identify/);
  }
  _setGlobal('browser', { capabilities: {}, getCurrentPackage: async () => 'com.android.systemui' });
  await assert.rejects(sessionAppIdentifier('Android'), /Cannot identify/);
  _setGlobal('browser', { capabilities: {}, execute: async () => { throw new Error('Driver disconnected'); } });
  await assert.rejects(sessionAppIdentifier('iOS'), /Driver disconnected/);
});

test('explicit uninstall identifiers take precedence', async t => {
  const previous = process.env.IOS_BUNDLE_ID;
  process.env.IOS_BUNDLE_ID = 'com.example.explicit';
  t.after(() => { if (previous === undefined) delete process.env.IOS_BUNDLE_ID; else process.env.IOS_BUNDLE_ID = previous; });
  _setGlobal('browser', { capabilities: {} });
  assert.equal(await sessionAppIdentifier('iOS'), 'com.example.explicit');
});
