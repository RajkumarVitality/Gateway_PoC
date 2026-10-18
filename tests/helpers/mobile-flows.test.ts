import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

for (const failHome of [false, true]) {
  test(`actual login/logout spec uses fixture credentials and validates before logout (home failure=${failHome})`, () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { LoginScreen } from './src/pages/LoginScreen.ts';
      import { HomeScreen } from './src/pages/HomeScreen.ts';
      import { executionReporter } from './src/utils/ExecutionReporter.ts';
      import { testAccounts } from './tests/helpers/user_helpers/TestUser.ts';
      Object.defineProperty(testAccounts, 'member', { get: () => 'mock-provisioned-member' });
      globalThis.fetch = () => { throw new Error('No network allowed in offline flow test'); };
      executionReporter.log = () => {};
      const calls = [];
      LoginScreen.prototype.validateScreen = async () => { calls.push('login-validate'); };
      LoginScreen.prototype.enterUsername = async value => { calls.push('username:' + value); };
      LoginScreen.prototype.enterPassword = async value => { calls.push('password:' + value); };
      LoginScreen.prototype.dismissKeyboard = async () => { calls.push('dismiss'); };
      LoginScreen.prototype.submit = async () => { calls.push('submit'); };
      HomeScreen.prototype.validateScreen = async () => {
        calls.push('home-validate');
        if (${failHome}) throw new Error('Home assertion failed');
      };
      HomeScreen.prototype.logout = async () => { calls.push('logout'); };
      const hooks = [], tests = [];
      globalThis.describe = (_name, body) => body();
      globalThis.before = (_name, body) => hooks.push(body);
      globalThis.it = (_name, body) => tests.push(body);
      await import('./tests/smoke/login-logout.spec.ts');
      for (const hook of hooks) await hook();
      assert.equal(tests.length, 1);
      if (${failHome}) await assert.rejects(tests[0](), /Home assertion failed/);
      else await tests[0]();
      assert.deepEqual(calls, [
        'login-validate', 'username:mock-provisioned-member', 'dismiss',
        'password:mock-password', 'dismiss', 'submit', 'home-validate',
        ...(${failHome} ? [] : ['logout'])
      ]);
    `], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, PLATFORM: 'iOS', APP_PASSWORD: 'mock-password', LT_SCENARIO: 'login-logout' }
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  });
}
