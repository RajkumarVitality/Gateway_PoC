import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { decryptSetting, encryptSecret, secretKey } from '../../src/config/secrets.js';
import { setting } from '../../src/config/mobileSessionInit.js';

test('authenticated encryption round-trips secrets with unique nonces', () => {
  const previousKey = process.env.APPIUM_SECRETS_KEY;
  const key = randomBytes(32).toString('base64');
  try {
    process.env.APPIUM_SECRETS_KEY = key;
    for (const value of ['test-access-key', 'password with spaces = : !', 'p\u00e4ssword']) {
      const encrypted = encryptSecret(value);
      assert.notEqual(encrypted, encryptSecret(value));
      assert.equal(decryptSetting(encrypted, 'APP_PASSWORD'), value);
    }
    assert.equal(decryptSetting('plain-secret', 'APP_PASSWORD'), 'plain-secret');
    assert.throws(() => encryptSecret(''), /empty secret/);
    for (const invalid of ['', 'not-base64', randomBytes(16).toString('base64')]) {
      assert.throws(() => secretKey(invalid), /32-byte/);
    }
  } finally {
    if (previousKey === undefined) delete process.env.APPIUM_SECRETS_KEY;
    else process.env.APPIUM_SECRETS_KEY = previousKey;
  }
});

test('runtime settings decrypt environment overrides and reject missing, wrong or corrupted keys', () => {
  const previousKey = process.env.APPIUM_SECRETS_KEY;
  const previousPassword = process.env.APP_PASSWORD;
  const key = randomBytes(32).toString('base64');
  const encrypted = encryptSecret('fixture-password', key);
  try {
    process.env.APP_PASSWORD = encrypted;
    process.env.APPIUM_SECRETS_KEY = key;
    assert.equal(setting('APP_PASSWORD'), 'fixture-password');
    delete process.env.APPIUM_SECRETS_KEY;
    assert.throws(() => setting('APP_PASSWORD'), /APPIUM_SECRETS_KEY/);
    process.env.APPIUM_SECRETS_KEY = randomBytes(32).toString('base64');
    assert.throws(() => setting('APP_PASSWORD'), /Unable to decrypt setting APP_PASSWORD/);
    process.env.APPIUM_SECRETS_KEY = key;
    const parts = encrypted.split(':');
    parts[3] = (parts[3].startsWith('A') ? 'B' : 'A') + parts[3].slice(1);
    process.env.APP_PASSWORD = parts.join(':');
    assert.throws(() => setting('APP_PASSWORD'), /Unable to decrypt/);
    for (const malformed of ['ENC[bad]', encrypted.replace('v1:', 'v2:'), 'ENC[v1:AA==:AA==:AA==]']) {
      process.env.APP_PASSWORD = malformed;
      assert.throws(() => setting('APP_PASSWORD'), /Invalid encrypted format/);
    }
  } finally {
    if (previousKey === undefined) delete process.env.APPIUM_SECRETS_KEY;
    else process.env.APPIUM_SECRETS_KEY = previousKey;
    if (previousPassword === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = previousPassword;
  }
});

test('CLI persists ciphertext, protects the separate key, preserves properties and supports repeat runs', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'appium-secrets-'));
  const propertyFile = path.join(directory, 'fixture.properties');
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: directory };
  delete env.APPIUM_SECRETS_KEY;
  const cwd = fileURLToPath(new URL('../../', import.meta.url));
  const run = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/encrypt-secrets.ts', propertyFile], {
    cwd, env, encoding: 'utf8', timeout: 15_000
  });
  const previousKey = process.env.APPIUM_SECRETS_KEY;
  try {
    writeFileSync(propertyFile, '# Keep this\r\nAccessKey : fixture-access\r\nAPP_PASSWORD=fixture-password\r\nLT_USERNAME=fixture-user\r\n');
    const result = run();
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /fixture-access|fixture-password/);
    const encrypted = readFileSync(propertyFile, 'utf8');
    assert.match(encrypted, /^# Keep this\r\nAccessKey : ENC\[v1:/);
    assert.match(encrypted, /LT_USERNAME=fixture-user\r\n$/);
    assert.doesNotMatch(encrypted, /fixture-access|fixture-password/);
    const keyFile = path.join(directory, '.config', 'appium-gateway', 'secrets.env');
    assert.equal(statSync(keyFile).mode & 0o777, 0o600);
    assert.equal(statSync(propertyFile).mode & 0o777, 0o600);
    const key = /^export APPIUM_SECRETS_KEY='([^']+)'/.exec(readFileSync(keyFile, 'utf8'))?.[1];
    assert.ok(key);
    process.env.APPIUM_SECRETS_KEY = key;
    for (const [name, expected] of [['AccessKey', 'fixture-access'], ['APP_PASSWORD', 'fixture-password']]) {
      const value = encrypted.split(/\r?\n/).find(line => line.startsWith(name))?.replace(/^[^=:]+[=:]\s*/, '');
      assert.ok(value);
      assert.equal(decryptSetting(value, name), expected);
    }
    assert.equal(run().status, 0);
    assert.equal(readFileSync(propertyFile, 'utf8'), encrypted);
    writeFileSync(propertyFile, 'APP_PASSWORD=fixture-password\n');
    const failed = run();
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /must contain APP_PASSWORD and LT_ACCESS_KEY/);
    assert.equal(readFileSync(propertyFile, 'utf8'), 'APP_PASSWORD=fixture-password\n');
  } finally {
    if (previousKey === undefined) delete process.env.APPIUM_SECRETS_KEY;
    else process.env.APPIUM_SECRETS_KEY = previousKey;
    rmSync(directory, { recursive: true });
  }
});
