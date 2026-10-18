import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadProperties } from '../../../src/config/properties.js';
import { requiredUserCreationSetting, userCreationSetting } from '../../../src/config/userCreation.js';

test('property loading preserves separators, comments, and file precedence', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'user-config-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = path.join(directory, 'first.properties');
  const second = path.join(directory, 'second.properties');
  await writeFile(first, '# comment\n! comment\nURL=https://example.invalid/svc\nAUTH=abc==\nENV:mdev\n');
  await writeFile(second, 'ENV=ca-test\n');
  const settings = loadProperties([path.join(directory, 'missing.properties'), first, second]);
  assert.equal(settings.get('URL'), 'https://example.invalid/svc');
  assert.equal(settings.get('AUTH'), 'abc==');
  assert.equal(settings.get('ENV'), 'ca-test');
  assert.equal(settings.size, 3);
  assert.throws(() => loadProperties([directory]), /Unable to read settings file/);
});

test('user creation supports runtime overrides and explicit missing-setting errors', () => {
  const previous = process.env.VG_ENVIRONMENT;
  try {
    process.env.VG_ENVIRONMENT = ' ca-dev ';
    assert.equal(userCreationSetting('VG_ENVIRONMENT'), 'ca-dev');
    assert.equal(requiredUserCreationSetting('VG_ENVIRONMENT'), 'ca-dev');
    assert.throws(
      () => requiredUserCreationSetting('VG_CONFIG_TEST_UNCONFIGURED'),
      /Missing required setting: VG_CONFIG_TEST_UNCONFIGURED.*user-creation.properties/
    );
  } finally {
    if (previous === undefined) delete process.env.VG_ENVIRONMENT;
    else process.env.VG_ENVIRONMENT = previous;
  }
});
