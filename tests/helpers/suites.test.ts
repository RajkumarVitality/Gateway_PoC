import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { suites } from '../../src/config/runner.js';

test('both packs select the current login/logout spec in a single worker', () => {
  for (const files of Object.values(suites)) {
    assert.deepEqual(files, ['./tests/smoke/login-logout.spec.ts']);
    assert.ok(existsSync(new URL(`../../${files[0]}`, import.meta.url)));
  }
});
