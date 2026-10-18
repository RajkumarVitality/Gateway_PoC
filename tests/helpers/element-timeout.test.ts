import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { executionTimeouts } from '../../src/config/timeoutsHandling.js';

for (const method of ['waitForElement', 'waitForVisibleElement', 'isElementVisible'] as const) {
  test(`${method} includes the initial lookup in the 3-second search budget`, async t => {
    let now = 0;
    const pauses: number[] = [];
    let checks = 0;
    t.mock.method(Date, 'now', () => now);
    _setGlobal('$', async () => {
      now += 100;
      return {
        isExisting: async () => { checks++; now += 100; return false; },
        isDisplayed: async () => { checks++; now += 100; return false; }
      };
    });
    _setGlobal('browser', {
      pause: async (duration: number) => { pauses.push(duration); now += duration; }
    });
    const session = new MobileSession('iOS');
    assert.equal(executionTimeouts().element, 3_000);
    if (method === 'isElementVisible') assert.equal(await session[method]('missing'), false);
    else await assert.rejects(session[method]('missing'), /within 3000 ms: missing/);
    assert.equal(now, 3_000);
    assert.equal(checks, 9);
    assert.ok(pauses.every(duration => duration <= 250));
  });
}

test('driver errors are not converted to missing-element results', async () => {
  _setGlobal('$', async () => { throw new Error('Driver disconnected'); });
  await assert.rejects(new MobileSession('iOS').isElementVisible('target'), /Driver disconnected/);
});
