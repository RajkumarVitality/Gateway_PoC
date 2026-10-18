import assert from 'node:assert/strict';
import { test } from 'node:test';
import { printUserDetails } from '../../../src/config/API-to-Create-New-User.js';

test('prints enrolled email, member party ID, insurer code and date of birth', t => {
  const previousEnvironment = process.env.VG_ENVIRONMENT;
  const previousPrefix = process.env.VG_MDEV_LOGIN_PREFIX;
  process.env.VG_ENVIRONMENT = 'mdev';
  process.env.VG_MDEV_LOGIN_PREFIX = 'mdev--';
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.VG_ENVIRONMENT;
    else process.env.VG_ENVIRONMENT = previousEnvironment;
    if (previousPrefix === undefined) delete process.env.VG_MDEV_LOGIN_PREFIX;
    else process.env.VG_MDEV_LOGIN_PREFIX = previousPrefix;
  });
  const log = t.mock.method(console, 'log', () => {});
  printUserDetails({
    userName: 'test-user@example.invalid',
    partyId: 40189132,
    insurerCode: '1009199112',
    bornOn: '1995-02-11'
  });
  assert.deepEqual(log.mock.calls.map(call => call.arguments), [
    ['User email ID: mdev--test-user@example.invalid'],
    ['Party ID: 40189132'],
    ['Insurer code: 1009199112'],
    ['Date of birth: 1995-02-11']
  ]);
});
