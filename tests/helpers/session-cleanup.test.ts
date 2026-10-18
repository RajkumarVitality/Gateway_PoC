import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

for (const fails of [false, true]) {
  test(`WDIO hooks print the bundle ID, uninstall, and leave session deletion to the runner (failure=${fails})`, () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { _setGlobal } from '@wdio/globals';
      import { config } from './wdio.conf.ts';
      const calls = [], logs = [];
      console.log = message => logs.push(message);
      console.error = () => {};
      _setGlobal('browser', {
        capabilities: { 'appium:bundleId': 'com.example.demo' },
        removeApp: async id => {
          calls.push('remove:' + id);
          if (${fails}) throw new Error('Uninstall failed');
        },
        deleteSession: async () => { throw new Error('Hooks must not double-delete the session'); }
      });
      await config.before();
      assert.ok(logs.includes('[MobileTestRunner] Bundle ID: com.example.demo'));
      if (${fails}) {
        await assert.rejects(config.after(), /Uninstall failed/);
        assert.equal(process.exitCode, 1);
        process.exitCode = 0;
      } else await config.after();
      assert.deepEqual(calls, ['remove:com.example.demo']);
      // The installed WDIO runner owns deletion between these hooks.
      await config.afterSession();
      assert.ok(logs.includes('[MobileTestRunner] Remote mobile session closed.'));
      await config.after();
      assert.equal(process.exitCode, 1);
      process.exitCode = 0;
      assert.equal(calls.length, 1);
    `], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 15_000,
      env: {
        ...process.env, PLATFORM: 'iOS', LT_SCENARIO: 'login-logout',
        LT_USERNAME: 'test-user', LT_ACCESS_KEY: 'test-key', appId: 'lt://test-app', LT_OPEN_LIVE_SESSION: 'false'
      }
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  });
}
