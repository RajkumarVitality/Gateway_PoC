import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { HomeScreen } from '../../src/pages/HomeScreen.js';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { loadElementStore } from '../../src/utils/mobileElementStore.js';

const store = await loadElementStore(new URL('../../src/elements/login.yml', import.meta.url), 'Home Screen');

test('all home visibility and text assertions run before Logout', async () => {
  const calls: string[] = [];
  _setGlobal('$', async (selector: string) => {
    const definition = Object.values(store.elements).find(element => element.ios === selector);
    assert.ok(definition);
    return {
      isDisplayed: async () => { calls.push(selector); return true; },
      getText: async () => definition.validation?.text,
      getAttribute: async () => '',
      click: async () => { calls.push('logout'); }
    };
  });
  const screen = new HomeScreen(new MobileSession('iOS'));
  await screen.validateScreen();
  await screen.logout();
  assert.deepEqual(calls, [
    ...Object.values(store.elements).map(element => element.ios),
    store.elements.logoutButton.ios, 'logout'
  ]);
});

test('named home assertions select the requested element and propagate failed text', async t => {
  const screen = new HomeScreen(new MobileSession('iOS'));
  const names: string[] = [];
  t.mock.method(screen, 'validateElement', async (name: string) => { names.push(name); });
  await screen.assertTextVisible('homeNavigationTitle');
  await screen.assertDataSourceStatusVisible();
  await screen.assertLogoutButtonVisible();
  assert.deepEqual(names, ['homeNavigationTitle', 'dataSourceName_Status', 'logoutButton']);
  t.mock.restoreAll();
  _setGlobal('$', async () => ({
    isDisplayed: async () => true, getText: async () => 'Status: Linked', getAttribute: async () => ''
  }));
  await assert.rejects(screen.assertDataSourceStatusVisible(), /expected text to equals "Status: Unlinked"/);
});
