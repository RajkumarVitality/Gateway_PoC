import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAllureRuns, reportIndexHtml } from '../src/utils/allureRuns.js';

try {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const runsRoot = path.join(root, 'target/allure-runs');
  const reportRoot = path.join(root, 'target/allure-report');
  const runs = (await readAllureRuns(runsRoot)).filter(run => run.status !== 'RUNNING');
  if (!runs.length) throw new Error('No completed saved runs found. Run a mobile test first; legacy target/allure-results are not assigned an environment or date.');
  for (const run of runs) {
    const output = path.join(reportRoot, 'runs', run.id);
    if (existsSync(path.join(output, 'index.html'))) continue;
    const result = spawnSync(process.execPath, [
      path.join(root, 'node_modules/allure-commandline/bin/allure'),
      'generate', path.join(runsRoot, run.id, 'results'), '--clean', '-o', output
    ], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Allure generation failed for ${run.id} (exit ${result.status}).`);
  }
  await mkdir(reportRoot, { recursive: true });
  await writeFile(path.join(reportRoot, 'index.html'), reportIndexHtml(runs), 'utf8');
  console.log(`Saved report index with ${runs.length} runs. Open it with npm run report:open.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Report generation failed.');
  process.exitCode = 1;
}
