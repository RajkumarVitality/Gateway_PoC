import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deleteUserInstruction } from '../../../src/config/API-to-Create-New-User.js';

test('deleteUserInstruction sends only the four onboarding IDs for the enrolled email', async t => {
  const settings = {
    VG_ENVIRONMENT: 'mdev',
    VG_MDEV_INTEGRATION_PLATFORM_BASE_URL: 'https://example.invalid/api/',
    VG_MDEV_TENANT_NUMBER: '9998',
    VG_MDEV_API_BEARER_TOKEN: 'Bearer test-delete-token',
    configUserAgent: 'test-agent'
  };
  for (const [key, value] of Object.entries(settings)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const instructionIds = {
    LOGIN_T_AND_C_ID: 128443661,
    GTBOnboardingJourney_ID: 128443681,
    OnboardingJourney_ID: 128443686,
    OnboardCommunPref_ID: 128443687,
    OnboardingReward_ID: 128443689
  };
  const userName = 'Test_261009131527@vgnet.testinator.com';
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://example.invalid/api/vitality-manage-user-service-v1/1.0/svc/9998/deleteUserInstruction');
    assert.equal(init.method, 'POST');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('Authorization'), 'Bearer test-delete-token');
    assert.equal(headers.get('User-Agent'), 'test-agent');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(String(init.body)), {
      instructions: [{ id: 128443681 }, { id: 128443686 }, { id: 128443687 }, { id: 128443689 }],
      userId: userName
    });
    return new Response(null, { status: 204 });
  });
  assert.equal((await deleteUserInstruction(userName, instructionIds)).status, 204);
  for (const status of [400, 401, 500]) {
    fetchMock.mock.mockImplementation(async () => Response.json({}, { status }));
    await assert.rejects(deleteUserInstruction(userName, instructionIds), new RegExp(`failed with HTTP ${status}`));
  }
  const calls = fetchMock.mock.callCount();
  await assert.rejects(deleteUserInstruction(' ', instructionIds), /non-empty userName/);
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, instructionIds.OnboardingJourney_ID]) {
    await assert.rejects(
      deleteUserInstruction(userName, { ...instructionIds, GTBOnboardingJourney_ID: id }),
      /four distinct positive integer/
    );
  }
  process.env.VG_MDEV_API_BEARER_TOKEN = '******';
  await assert.rejects(deleteUserInstruction(userName, instructionIds), /before deleting user instructions/);
  assert.equal(fetchMock.mock.callCount(), calls);
});
