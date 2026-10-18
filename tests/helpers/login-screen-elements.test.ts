import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { LoginScreen } from '../../src/pages/LoginScreen.js';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { loadElementStore } from '../../src/utils/mobileElementStore.js';

const store = await loadElementStore(new URL('../../src/elements/login.yml', import.meta.url), 'LoginScreen and WelcomeScreen');

for (const platform of ['Android', 'iOS'] as const) {
  test(`${platform} login actions use YAML selectors and provided credentials`, async t => {
    const session = new MobileSession(platform);
    const screen = new LoginScreen(session);
    const calls: unknown[][] = [];
    const key = session.isIOS ? 'ios' : 'android';
    t.mock.method(session, 'typeIntoElement', async (selector: string, value: string) => {
      calls.push(['type', selector, value]);
    });
    t.mock.method(session, 'clickElement', async (selector: string) => { calls.push(['click', selector]); });
    _setGlobal('browser', { pause: async (duration: number) => { calls.push(['pause', duration]); } });
    await screen.enterUsername('test-user');
    await screen.dismissKeyboard();
    await screen.enterPassword('test-password');
    await screen.submit();
    assert.deepEqual(calls, [
      ['type', store.elements.usernameField[key], 'test-user'],
      ['click', store.elements.welcomeMessage[key]],
      ['type', store.elements.passwordField[key], 'test-password'],
      ['pause', 300], ['click', store.elements.loginButton[key]]
    ]);
  });

  test(`${platform} text falls back only to its native text attribute`, async () => {
    const attributes: string[] = [];
    _setGlobal('$', async () => ({
      isDisplayed: async () => true,
      getText: async () => ' ',
      getAttribute: async (attribute: string) => {
        attributes.push(attribute);
        return ` ${store.elements.welcomeMessage.validation?.text} `;
      }
    }));
    await new LoginScreen(new MobileSession(platform)).validateElement('welcomeMessage');
    assert.deepEqual(attributes, [platform === 'iOS' ? 'value' : 'content-desc']);
  });
}

test('login validates all six elements and fails on mismatch or unknown names', async () => {
  const selectors: string[] = [];
  let wrong = false;
  _setGlobal('$', async (selector: string) => {
    selectors.push(selector);
    const definition = Object.values(store.elements).find(element => element.ios === selector);
    assert.ok(definition);
    return {
      isDisplayed: async () => true,
      getText: async () => wrong ? 'Wrong greeting' : ` ${definition.validation?.text} `,
      getAttribute: async () => { throw new Error('Non-empty text must not use fallback'); }
    };
  });
  const screen = new LoginScreen(new MobileSession('iOS'));
  await screen.validateScreen();
  assert.deepEqual(selectors, Object.values(store.elements).map(element => element.ios));
  wrong = true;
  await assert.rejects(screen.validateElement('welcomeMessage'), /but found "Wrong greeting"/);
  await assert.rejects(screen.validateElement('toString'), /Missing element/);
});
