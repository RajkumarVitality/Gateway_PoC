import assert from 'node:assert/strict';
import { test } from 'node:test';
import { processEvents } from '../../../src/config/API-to-Create-New-User.js';

test('processEvents sends the enrolment party ID and current timestamp with fixed metadata', async t => {
  const settings = {
    VG_ENVIRONMENT: 'mdev',
    VG_MDEV_INTEGRATION_PLATFORM_BASE_URL: 'https://example.invalid/api/',
    VG_MDEV_TENANT_NUMBER: '9998',
    VG_MDEV_API_BEARER_TOKEN: 'Bearer test-events-token'
  };
  for (const [key, value] of Object.entries(settings)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  t.mock.method(Date, 'now', () => Date.parse('2026-10-10T06:11:57.456Z'));
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://example.invalid/api/vitality-manage-events-service-v1/1.0/svc/9998/processEvents');
    assert.equal(init.method, 'POST');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('Authorization'), 'Bearer test-events-token');
    assert.equal(headers.get('Content-Type'), 'application/x-www-form-urlencoded');
    assert.deepEqual(JSON.parse(String(init.body)), {
      processEventsRequest: {
        eventIn: [{
          applicableTo: 40189132,
          eventCapturedOn: '2026-10-10T08:11:57.000+02:00',
          eventMetaData: [{ typeKey: 197, value: 1001 }],
          eventOccuredOn: '2026-10-10T08:11:57.000+02:00',
          eventSourceTypeKey: 1,
          reportedBy: 40189132,
          typeKey: 1016
        }]
      }
    });
    return Response.json({ processed: true });
  });
  assert.deepEqual(await (await processEvents(40189132)).json(), { processed: true });
  for (const status of [400, 401, 500]) {
    fetchMock.mock.mockImplementation(async () => Response.json({}, { status }));
    await assert.rejects(processEvents(40189132), new RegExp(`failed with HTTP ${status}`));
  }
  const calls = fetchMock.mock.callCount();
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(processEvents(id), /positive integer enrolment party ID/);
  }
  process.env.VG_MDEV_API_BEARER_TOKEN = '******';
  await assert.rejects(processEvents(40189132), /before processing events/);
  assert.equal(fetchMock.mock.callCount(), calls);
});
