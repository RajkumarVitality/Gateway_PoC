import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { promptSelection } from '../../scripts/run-tests.js';

test('platform prompt accepts a default, a numbered choice, and a named choice', async () => {
  const answers = ['', '1', 'ios'];
  const prompts: string[] = [];
  const prompt = {
    async question(message: string): Promise<string> {
      prompts.push(message);
      return answers.shift()!;
    }
  };
  const options = [
    { value: 'Android', label: 'Android', aliases: ['android'] },
    { value: 'iOS', label: 'iOS', aliases: ['ios'] }
  ];
  assert.equal(await promptSelection(prompt, 'Select platform', options, 'iOS'), 'iOS');
  assert.equal(await promptSelection(prompt, 'Select platform', options, 'iOS'), 'Android');
  assert.equal(await promptSelection(prompt, 'Select platform', options, 'Android'), 'iOS');
  assert.equal(prompts.length, 3);
  assert.equal(prompts[0], 'Select platform:\n1- Android\n2- iOS (default iOS)\n: ');
});

test('environment prompt retries invalid input and maps aliases to canonical values', async () => {
  const answers = ['invalid', '2', 'cadev'];
  const printed: string[] = [];
  const originalLog = console.log;
  const prompt = { async question(): Promise<string> { return answers.shift()!; } };
  const options = [
    { value: 'mdev', label: 'mdev', aliases: ['mdev'] },
    { value: 'ca-test', label: 'catest / ca-test', aliases: ['catest', 'ca-test'] },
    { value: 'ca-dev', label: 'cadev / ca-dev', aliases: ['cadev', 'ca-dev'] }
  ];
  try {
    console.log = message => printed.push(String(message));
    assert.equal(await promptSelection(prompt, 'Select environment', options, 'mdev'), 'ca-test');
    assert.equal(await promptSelection(prompt, 'Select environment', options, 'mdev'), 'ca-dev');
  } finally {
    console.log = originalLog;
  }
  assert.match(printed[0], /Invalid select environment/);
});

test('every interactive mobile npm script uses the shared run launcher', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  for (const script of ['test', 'test:smoke', 'test:regression', 'test:login', 'test:android', 'test:ios']) {
    assert.match(packageJson.scripts[script], /scripts\/run-tests\.ts/);
  }
});
