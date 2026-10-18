import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureLoginEvents } from '../../../src/config/API-to-Create-New-User.js';

test('capture login events preserves the request and diagnoses failures without replaying writes', async t => {
  const settings = {
    VG_ENVIRONMENT: 'ca-test',
    VG_CA_TEST_INTEGRATION_PLATFORM_BASE_URL: 'https://example.invalid/api/',
    VG_CA_TEST_TENANT_NUMBER: '9998',
    VG_CA_TEST_API_BEARER_TOKEN: 'test-bearer-token',
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
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    assert.equal(milliseconds, 30_000);
    return timeout(milliseconds);
  });
  const success = Response.json({ captured: true });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://example.invalid/api/vitality-manage-user-service-v1/1.0/svc/9998/captureLoginEvents/123');
    assert.equal(init.method, 'POST');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('Authorization'), 'Bearer test-bearer-token');
    assert.equal(headers.get('User-Agent'), 'test-agent');
    const body = JSON.parse(String(init.body));
    assert.equal(body.loginSuccess, true);
    assert.deepEqual(body.userInstructionResponses, [{ id: 456, typeKey: 1, value: 'true' }]);
    assert.ok(init.signal instanceof AbortSignal);
    return success;
  });
  assert.equal(await captureLoginEvents(123, 456), success);

  for (const code of ['ECONNRESET', 'ENOTFOUND', 'CERT_HAS_EXPIRED', 'UND_ERR_CONNECT_TIMEOUT']) {
    const original = new TypeError('fetch failed', {
      cause: new AggregateError([Object.assign(new Error('connection failed'), { code })])
    });
    fetchMock.mock.mockImplementation(async () => { throw original; });
    const calls = fetchMock.mock.callCount();
    await assert.rejects(captureLoginEvents(123, 456), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.cause, original);
      assert.ok(error.message.includes(code));
      assert.match(error.message, /VG_CA_TEST_INTEGRATION_PLATFORM_BASE_URL/);
      assert.match(error.message, /https:\/\/example.invalid/);
      assert.match(error.message, /POST was not retried/);
      assert.equal(error.message.includes('test-bearer-token'), false);
      assert.equal(error.message.includes('/captureLoginEvents/123'), false);
      return true;
    });
    assert.equal(fetchMock.mock.callCount(), calls + 1);
  }
  fetchMock.mock.mockImplementation(async () => { throw new DOMException('expired', 'TimeoutError'); });
  await assert.rejects(captureLoginEvents(123, 456), /timeout after 30000 ms/);
  fetchMock.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  const calls = fetchMock.mock.callCount();
  await assert.rejects(captureLoginEvents(123, 456), /failed with HTTP 503.*VG_CA_TEST_/);
  assert.equal(fetchMock.mock.callCount(), calls + 1);
});
