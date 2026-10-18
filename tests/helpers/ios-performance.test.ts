import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { executionTimeouts } from '../../src/config/timeoutsHandling.js';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';

test('selects iOS locators by the name attribute, including button alternatives', () => {
  const session = new MobileSession('iOS');
  assert.equal(session.getPlatformLocator('//android-target', "//*[@name='question_0']"), "//*[@name='question_0']");
  assert.equal(
    session.getPlatformLocator(
      '//android-target',
      "//*[@name='btn_vg_next_button'] | //*[@name='btn_vg_submit_button']"
    ),
    "//*[@name='btn_vg_next_button'] | //*[@name='btn_vg_submit_button']"
  );
});

test('preserves complex XPath and already native selectors', () => {
  const session = new MobileSession('iOS');
  for (const selector of [
    "//*[@name='field'] | //XCUIElementTypeTextField[1]",
    "//*[normalize-space(@label)='Yes']"
  ]) {
    assert.equal(session.getPlatformLocator('//android-target', selector), selector);
  }
});

test('separates execution timeout from element wait and validates overrides', () => {
  const previousWait = process.env.LT_WAIT_SECONDS;
  const previousTest = process.env.LT_TEST_TIMEOUT_SECONDS;
  try {
    process.env.LT_WAIT_SECONDS = '300';
    process.env.LT_TEST_TIMEOUT_SECONDS = '900';
    assert.deepEqual(executionTimeouts(), { element: 300_000, test: 900_000 });
    process.env.LT_TEST_TIMEOUT_SECONDS = '1200';
    assert.equal(executionTimeouts().test, 1_200_000);
    for (const invalid of ['0', '-1', 'abc', 'Infinity', '300']) {
      process.env.LT_TEST_TIMEOUT_SECONDS = invalid;
      assert.throws(() => executionTimeouts(), /LT_TEST_TIMEOUT_SECONDS/);
    }
  } finally {
    if (previousWait === undefined) delete process.env.LT_WAIT_SECONDS;
    else process.env.LT_WAIT_SECONDS = previousWait;
    if (previousTest === undefined) delete process.env.LT_TEST_TIMEOUT_SECONDS;
    else process.env.LT_TEST_TIMEOUT_SECONDS = previousTest;
  }
});

test('visible-element checks avoid an extra existence command and preserve Android locators', async () => {
  let visibilityCalls = 0;
  _setGlobal('$', async () => ({
    isDisplayed: async () => { visibilityCalls++; return true; },
    isExisting: async () => { throw new Error('Redundant existence lookup'); }
  }));
  const session = new MobileSession('iOS');
  await session.waitForVisibleElement("//*[@name='question_0']");
  assert.equal(visibilityCalls, 1);
  assert.equal(session.getPlatformLocator('//android-target', "//*[@name='question_0']"),
    "//*[@name='question_0']");
  assert.equal(new MobileSession('Android').getPlatformLocator('//android-target', "//*[@name='question_0']"),
    '//android-target');
});
