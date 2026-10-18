import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { _setGlobal } from '@wdio/globals';
import { ExecutionReporter } from '../../src/utils/ExecutionReporter.js';

test('reporting preserves local artifacts and forwards steps and attachments', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'appium-report-test-'));
  const previousRoot = process.env.LT_ARTIFACTS_DIR;
  process.env.LT_ARTIFACTS_DIR = root;
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.LT_ARTIFACTS_DIR;
    else process.env.LT_ARTIFACTS_DIR = previousRoot;
    await rm(root, { recursive: true, force: true });
  });

  const screenshot = Buffer.from('test-screenshot');
  _setGlobal('browser', {
    saveScreenshot: async (filePath: string) => { await writeFile(filePath, screenshot); },
    getPageSource: async () => '<page>Failure evidence</page>'
  });
  const steps: string[] = [];
  const attachments: { name: string; content: string | Buffer; type: string }[] = [];
  const reporter = new ExecutionReporter();
  reporter.startTest('Reporting', 'attachments', {
    addStep: async message => { steps.push(message); },
    addAttachment: async (name, content, type) => { attachments.push({ name, content, type }); }
  });
  reporter.log('Assessment submitted');
  const screenshotPath = await reporter.captureScreenshot('failure');
  const sourcePath = await reporter.capturePageSource('failure-source');
  const configPath = await reporter.captureTextArtifact('session-config', 'platform=Android');
  await reporter.finishTest('FAILED');

  assert.ok(screenshotPath);
  assert.ok(sourcePath);
  assert.ok(configPath);
  assert.deepEqual(await readFile(screenshotPath), screenshot);
  assert.equal(await readFile(sourcePath, 'utf8'), '<page>Failure evidence</page>');
  assert.equal(await readFile(configPath, 'utf8'), 'platform=Android');
  assert.ok(steps.includes('Assessment submitted'));
  assert.deepEqual(attachments.map(({ name, type }) => ({ name, type })), [
    { name: 'failure', type: 'image/png' },
    { name: 'failure-source', type: 'application/xml' },
    { name: 'session-config', type: 'text/plain' },
    { name: 'execution.log', type: 'text/plain' }
  ]);
  assert.match(String(attachments[3].content), /Assessment submitted/);
  assert.match(String(attachments[3].content), /Execution status: FAILED/);
});
