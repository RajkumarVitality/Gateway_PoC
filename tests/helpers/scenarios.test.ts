import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { resolveScenario, scenarios } from '../../src/config/runner.js';
import { selectedPlatform } from '../../src/config/mobileSessionInit.js';
import { executionTimeouts } from '../../src/config/timeoutsHandling.js';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';

test('every registered scenario points to an existing Mocha spec', () => {
  for (const [scenario, definition] of Object.entries(scenarios)) {
    assert.match(definition.file, /^(smoke|regression)\/[a-z0-9-]+\.spec\.ts$/);
    assert.ok(existsSync(new URL(`../${definition.file}`, import.meta.url)), scenario);
    assert.equal(resolveScenario(scenario, 'Android'), scenario);
    assert.equal(resolveScenario(scenario, 'iOS'), scenario);
  }
});

test('login/logout selects the same cross-platform spec on Android and iOS', () => {
  for (const alias of ['login-logout', 'loginAndLogout', 'flutter-login-screen']) {
    assert.equal(resolveScenario(alias, 'Android'), 'login-logout');
    assert.equal(resolveScenario(alias, 'iOS'), 'login-logout');
  }
  assert.equal(scenarios['login-logout'].file, 'smoke/login-logout.spec.ts');
});

test('login/logout uses the runtime platform without a scenario override', () => {
  const previousPlatform = process.env.PLATFORM;
  try {
    for (const platform of ['Android', 'iOS'] as const) {
      process.env.PLATFORM = platform;
      assert.equal(selectedPlatform(), platform);
      assert.equal(resolveScenario('login-logout', selectedPlatform()), 'login-logout');
    }
    assert.equal(Object.hasOwn(scenarios['login-logout'], 'platform'), false);
  } finally {
    if (previousPlatform === undefined) delete process.env.PLATFORM;
    else process.env.PLATFORM = previousPlatform;
  }
});

test('unsupported scenarios fail explicitly', () => {
  for (const value of ['', 'unknown', 'toString', '__proto__']) {
    assert.throws(() => resolveScenario(value, 'Android'), /Unsupported LT_SCENARIO/);
  }
});

test('every scenario and platform uses shared execution timeouts', () => {
  const previousScenario = process.env.LT_SCENARIO;
  const previousWait = process.env.LT_WAIT_SECONDS;
  const previousTest = process.env.LT_TEST_TIMEOUT_SECONDS;
  try {
    delete process.env.LT_WAIT_SECONDS;
    delete process.env.LT_TEST_TIMEOUT_SECONDS;
    for (const scenario of ['login', ...Object.keys(scenarios)]) {
      process.env.LT_SCENARIO = scenario;
      const defaults = executionTimeouts();
      assert.equal(defaults.test, 5_000);
      assert.equal(defaults.element, 3_000);
      assert.equal(new MobileSession('Android').waitTimeout, defaults.element);
      assert.equal(new MobileSession('iOS').waitTimeout, defaults.element);
    }
    process.env.LT_WAIT_SECONDS = '10';
    process.env.LT_TEST_TIMEOUT_SECONDS = '20';
    assert.equal(new MobileSession('Android').waitTimeout,5_000);
    assert.equal(new MobileSession('iOS').waitTimeout, 5_000);
  } finally {
    if (previousScenario === undefined) delete process.env.LT_SCENARIO;
    else process.env.LT_SCENARIO = previousScenario;
    if (previousWait === undefined) delete process.env.LT_WAIT_SECONDS;
    else process.env.LT_WAIT_SECONDS = previousWait;
    if (previousTest === undefined) delete process.env.LT_TEST_TIMEOUT_SECONDS;
    else process.env.LT_TEST_TIMEOUT_SECONDS = previousTest;
  }
});
