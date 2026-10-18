import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAllureRun, readAllureRuns, reportIndexHtml } from '../../src/utils/allureRuns.js';
import { saveAllureRun, type AllureRun } from '../../src/utils/allureRuns.js';
import { selectedEnvironment } from '../../src/config/userCreation.js';

test('environment aliases select the canonical provisioning and report environment', () => {
  const previous = process.env.VG_ENVIRONMENT;
  try {
    for (const [value, expected] of [
      ['mdev', 'mdev'], ['catest', 'ca-test'], ['ca-test', 'ca-test'],
      ['cadev', 'ca-dev'], ['ca-dev', 'ca-dev'], [' CATEST ', 'ca-test']
    ]) {
      process.env.VG_ENVIRONMENT = value;
      assert.equal(selectedEnvironment(), expected);
    }
    process.env.VG_ENVIRONMENT = 'invalid';
    assert.throws(selectedEnvironment, /VG_ENVIRONMENT must be/);
  } finally {
    if (previous === undefined) delete process.env.VG_ENVIRONMENT;
    else process.env.VG_ENVIRONMENT = previous;
  }
});

test('runs preserve independent results and persist environment, UTC dates and final status', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'allure-runs-'));
  try {
    assert.deepEqual(await readAllureRuns(path.join(directory, 'missing')), []);
    const first = createAllureRun('mdev', 'Android', 'login-logout');
    const second = createAllureRun('ca-test', 'iOS', 'login-logout');
    assert.notEqual(first.id, second.id);
    await saveAllureRun(directory, first);
    await saveAllureRun(directory, second);
    first.status = 'FAILED';
    first.finishedAt = new Date().toISOString();
    await saveAllureRun(directory, first);
    const runs = await readAllureRuns(directory);
    assert.equal(runs.length, 2);
    assert.equal(runs.find(run => run.id === first.id)?.status, 'FAILED');
    assert.equal(runs.find(run => run.id === second.id)?.status, 'RUNNING');
    const properties = await readFile(path.join(directory, first.id, 'results/environment.properties'), 'utf8');
    assert.match(properties, /VG_ENVIRONMENT=mdev/);
    assert.ok(properties.includes(`Execution_started_UTC=${first.startedAt}`));
    assert.match(properties, /Run_status=FAILED/);
    assert.doesNotMatch(properties, /PASSWORD|ACCESS_KEY|TOKEN/);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('report index executes inclusive date/environment filters, empty/invalid ranges and reset safely', () => {
  const fixtures: AllureRun[] = [
    { id: 'first', environment: 'mdev', platform: 'Android', scenario: '<script>alert(1)</script>', startedAt: '2026-10-15T23:59:59.000Z', status: 'PASSED' },
    { id: 'second', environment: 'ca-test', platform: 'iOS', scenario: 'login', startedAt: '2026-10-16T00:00:00.000Z', status: 'FAILED' },
    { id: 'third', environment: 'ca-dev', platform: 'iOS', scenario: 'login', startedAt: '2026-10-17T00:00:00.000Z', status: 'PASSED' }
  ];
  const html = reportIndexHtml(fixtures);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1];
  assert.ok(script);
  const rows: { textContent?: string; link?: { href: string } }[][] = [];
  const listeners: Record<string, () => void> = {};
  const controls = {
    environment: { value: '' }, from: { value: '' }, to: { value: '' },
    summary: { textContent: '' },
    runs: {
      replaceChildren: () => { rows.length = 0; },
      insertRow: () => {
        const cells: typeof rows[number] = [];
        rows.push(cells);
        return { insertCell: () => {
          const cell = { textContent: '', append: (link: { href: string }) => { Object.assign(cell, { link }); } };
          cells.push(cell);
          return cell;
        } };
      }
    },
    filters: { addEventListener: (event: string, callback: () => void) => { listeners[event] = callback; } }
  };
  runInNewContext(script, {
    document: {
      getElementById: (id: keyof typeof controls) => controls[id],
      createElement: () => ({ href: '', textContent: '' })
    },
    setTimeout: (callback: () => void) => callback()
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[0][3].textContent, fixtures[0].scenario);
  assert.equal(rows[0][5].link?.href, 'runs/first/index.html');
  controls.from.value = '2026-10-16';
  controls.to.value = '2026-10-16';
  listeners.input();
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1].textContent, 'ca-test');
  controls.environment.value = 'mdev';
  listeners.input();
  assert.equal(rows.length, 0);
  assert.match(controls.summary.textContent, /no matching runs/);
  controls.from.value = '2026-10-17';
  listeners.input();
  assert.match(controls.summary.textContent, /From date must be/);
  controls.environment.value = '';
  controls.from.value = '';
  controls.to.value = '';
  listeners.reset();
  assert.equal(rows.length, 3);
});

test('report generator builds real Allure reports for completed runs and preserves them on regeneration', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'allure-generator-'));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  try {
    await mkdir(path.join(directory, 'scripts'), { recursive: true });
    await mkdir(path.join(directory, 'src/utils'), { recursive: true });
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    for (const file of ['scripts/generate-reports.ts', 'src/utils/allureRuns.ts']) {
      await copyFile(path.join(root, file), path.join(directory, file));
    }
    const runsRoot = path.join(directory, 'target/allure-runs');
    const run = createAllureRun('ca-test', 'Android', 'fixture-login');
    run.status = 'PASSED';
    run.finishedAt = new Date().toISOString();
    await saveAllureRun(runsRoot, run);
    const active = createAllureRun('ca-dev', 'iOS', 'still-running');
    await saveAllureRun(runsRoot, active);
    await writeFile(path.join(runsRoot, run.id, 'results/fixture-result.json'), JSON.stringify({
      uuid: 'fixture', historyId: 'fixture', name: 'Fixture login', fullName: 'Fixture.login',
      status: 'passed', stage: 'finished', start: Date.now() - 1000, stop: Date.now(),
      labels: [{ name: 'environment', value: 'ca-test' }]
    }));
    const generate = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/generate-reports.ts'], {
      cwd: directory, encoding: 'utf8', timeout: 60_000
    });

    const first = generate();
    assert.ifError(first.error);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const reportRoot = path.join(directory, 'target/allure-report');
    const index = await readFile(path.join(reportRoot, 'index.html'), 'utf8');
    assert.ok(index.includes(run.id));
    assert.ok(!index.includes(active.id));
    const report = path.join(reportRoot, 'runs', run.id);
    const summary = JSON.parse(await readFile(path.join(report, 'widgets/summary.json'), 'utf8'));
    assert.equal(summary.statistic.passed, 1);
    const environment = await readFile(path.join(report, 'widgets/environment.json'), 'utf8');
    assert.ok(environment.includes('ca-test'));
    await writeFile(path.join(report, 'preserve.txt'), 'keep saved report');
    const second = generate();
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.equal(await readFile(path.join(report, 'preserve.txt'), 'utf8'), 'keep saved report');
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('WDIO lifecycle shares the result directory with workers and finalizes run metadata', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { readFile, rm } from 'node:fs/promises';
    import path from 'node:path';
    import { spawnSync } from 'node:child_process';
    import { config } from './wdio.conf.ts';
    const reporter = config.reporters.find(value => Array.isArray(value) && value[0] === 'allure');
    const output = reporter[1].outputDir;
    const directory = path.dirname(output);
    try {
      await config.onPrepare();
      const initial = JSON.parse(await readFile(path.join(directory, 'run.json'), 'utf8'));
      assert.equal(initial.environment, 'ca-test');
      assert.equal(initial.status, 'RUNNING');
      const worker = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
        "import { config } from './wdio.conf.ts'; process.stdout.write(config.reporters.find(value => Array.isArray(value) && value[0] === 'allure')[1].outputDir);"
      ], { encoding: 'utf8', env: process.env, timeout: 15000 });
      assert.equal(worker.status, 0, worker.stderr);
      assert.equal(worker.stdout, output);
      await config.onComplete(1);
      const final = JSON.parse(await readFile(path.join(directory, 'run.json'), 'utf8'));
      assert.equal(final.status, 'FAILED');
      assert.ok(final.finishedAt);
      assert.equal(process.env.APPIUM_ALLURE_RUN, undefined);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  `], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    encoding: 'utf8', timeout: 20_000,
    env: {
      ...process.env, APPIUM_ALLURE_RUN: '', VG_ENVIRONMENT: 'catest',
      PLATFORM: 'Android', LT_SCENARIO: 'login-logout',
      LT_USERNAME: 'fixture-user', LT_ACCESS_KEY: 'fixture-key', appId: 'lt://fixture-app'
    }
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
