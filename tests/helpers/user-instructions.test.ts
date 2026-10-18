import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getUserInstruction } from '../../src/config/API-to-Create-New-User.js';

const typeCodes = [
  'LOGIN_T_AND_C', 'GTBOnboardingJourney', 'OnboardingJourney', 'OnboardCommunPref', 'OnboardingReward'
];
const instructions = typeCodes.map((typeCode, index) => ({ typeCode, id: index + 1 }));
const expected = {
  LOGIN_T_AND_C_ID: 1,
  GTBOnboardingJourney_ID: 2,
  OnboardingJourney_ID: 3,
  OnboardCommunPref_ID: 4,
  OnboardingReward_ID: 5
};

test('user instruction lookup', async t => {
  const settings = {
    VG_ENVIRONMENT: 'mdev',
    VG_MDEV_ZUUL_URL: 'https://example.invalid',
    VG_MDEV_TENANT_NUMBER: '9998'
  };
  for (const [key, value] of Object.entries(settings)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  await t.test('preserves request and result shapes with a bounded request', async t => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const timeoutMock = t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
      assert.equal(milliseconds, 30_000);
      return timeout(milliseconds);
    });
    const mock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      assert.equal(url, 'https://example.invalid/vitality-manage-user-service-1/svc/9998/getUserInstruction');
      assert.equal(init.method, 'POST');
      assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
      assert.deepEqual(JSON.parse(String(init.body)), { userId: 'member@example.invalid' });
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.signal.aborted, false);
      return Response.json({ instructions });
    });
    assert.deepEqual(await getUserInstruction('member@example.invalid'), expected);
    assert.equal(mock.mock.callCount(), 1);
    assert.equal(timeoutMock.mock.callCount(), 1);
  });

  for (const kind of ['socket', 'aggregate', 'timeout', 'body', 'gateway']) {
    await t.test(`recovers from transient ${kind} failure`, async t => {
      let calls = 0;
      const failure = new TypeError('fetch failed', {
        cause: kind === 'aggregate'
          ? new AggregateError([Object.assign(new Error('connect'), { code: 'ETIMEDOUT' })])
          : Object.assign(new Error('socket closed'), { code: 'UND_ERR_SOCKET' })
      });
      const warnings: string[] = [];
      t.mock.method(console, 'warn', (message: string) => { warnings.push(message); });
      t.mock.method(globalThis, 'fetch', async () => {
        if (++calls === 1) {
          if (kind === 'gateway') return new Response(null, { status: 503 });
          if (kind === 'timeout') throw new DOMException('timeout', 'TimeoutError');
          if (kind === 'body') {
            return new Response(new ReadableStream({
              start(controller) { controller.error(failure); }
            }));
          }
          throw failure;
        }
        return Response.json({ instructions });
      });
      assert.deepEqual(await getUserInstruction('member@example.invalid'), expected);
      assert.equal(calls, 2);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /Retrying lookup \(2\/3\) in 500 ms/);
      assert.ok(!warnings[0].includes('member@example.invalid'));
    });
  }

  await t.test('caps retries and preserves the original network cause', async t => {
    const original = new TypeError('fetch failed', {
      cause: Object.assign(new Error('socket closed'), { code: 'ECONNRESET' })
    });
    const mock = t.mock.method(globalThis, 'fetch', async () => { throw original; });
    const warn = t.mock.method(console, 'warn', () => {});
    await assert.rejects(getUserInstruction('member@example.invalid'), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /ECONNRESET/);
      assert.match(error.message, /VPN, DNS, proxy and TLS/);
      assert.match(error.message, /Failed after 3 attempt/);
      assert.ok(error.cause instanceof Error);
      assert.equal(error.cause.cause, original);
      return true;
    });
    assert.equal(mock.mock.callCount(), 3);
    assert.equal(warn.mock.callCount(), 2);
  });

  for (const kind of ['auth', 'tls', 'dns', 'unknown', 'json', 'missing', 'duplicate', 'invalid-id']) {
    await t.test(`does not retry permanent ${kind} failure`, async t => {
      const mock = t.mock.method(globalThis, 'fetch', async () => {
        if (kind === 'auth') return new Response(null, { status: 401 });
        if (kind === 'tls' || kind === 'dns') {
          throw new TypeError('fetch failed', {
            cause: Object.assign(new Error('connect failed'), {
              code: kind === 'tls' ? 'CERT_HAS_EXPIRED' : 'ENOTFOUND'
            })
          });
        }
        if (kind === 'unknown') throw new TypeError('fetch failed');
        if (kind === 'json') return new Response('not json');
        if (kind === 'missing') return Response.json({});
        if (kind === 'duplicate') return Response.json({ instructions: [...instructions, instructions[0]] });
        if (kind === 'invalid-id') {
          return Response.json({ instructions: instructions.map(item => ({ ...item, id: 0 })) });
        }
        throw new Error('Unexpected test case');
      });
      await assert.rejects(getUserInstruction('member@example.invalid'), (error: unknown) => {
        assert.ok(error instanceof Error);
        if (kind === 'json') assert.match(error.message, /response contained invalid JSON/);
        return true;
      });
      assert.equal(mock.mock.callCount(), 1);
    });
  }

  await t.test('rejects empty usernames without a request', async t => {
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ instructions }));
    await assert.rejects(getUserInstruction(' '), /non-empty userName/);
    assert.equal(mock.mock.callCount(), 0);
  });
});
