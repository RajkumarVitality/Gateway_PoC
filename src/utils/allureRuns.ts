import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface AllureRun {
  id: string;
  environment: 'mdev' | 'ca-test' | 'ca-dev';
  platform: string;
  scenario: string;
  startedAt: string;
  finishedAt?: string;
  status: 'RUNNING' | 'PASSED' | 'FAILED';
}

export function createAllureRun(environment: AllureRun['environment'], platform: string, scenario: string): AllureRun {
  const startedAt = new Date().toISOString();
  return {
    id: `${startedAt.replace(/[:.]/g, '-')}-${randomUUID()}`,
    environment, platform, scenario, startedAt, status: 'RUNNING'
  };
}

export async function saveAllureRun(root: string, run: AllureRun): Promise<void> {
  const directory = path.join(root, run.id);
  await mkdir(path.join(directory, 'results'), { recursive: true });
  await writeFile(path.join(directory, 'run.json'), JSON.stringify(run, null, 2), 'utf8');
  await writeFile(path.join(directory, 'results', 'environment.properties'),
    `VG_ENVIRONMENT=${run.environment}\nPlatform=${run.platform}\nScenario=${run.scenario}\nExecution_started_UTC=${run.startedAt}\nExecution_finished_UTC=${run.finishedAt ?? 'Running'}\nRun_status=${run.status}\n`, 'utf8');
}

export async function readAllureRuns(root: string): Promise<AllureRun[]> {
  let directories;
  try {
    directories = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const runs: AllureRun[] = [];
  for (const directory of directories) {
    if (!directory.isDirectory()) continue;
    const value: unknown = JSON.parse(await readFile(path.join(root, directory.name, 'run.json'), 'utf8'));
    if (!value || typeof value !== 'object'
      || !('id' in value) || value.id !== directory.name
      || !('environment' in value) || !['mdev', 'ca-test', 'ca-dev'].includes(String(value.environment))
      || !('startedAt' in value) || typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt))
      || !('status' in value) || !['RUNNING', 'PASSED', 'FAILED'].includes(String(value.status))
      || !('platform' in value) || typeof value.platform !== 'string'
      || !('scenario' in value) || typeof value.scenario !== 'string') {
      throw new Error(`Invalid Allure run metadata in ${directory.name}.`);
    }
    runs.push(value as AllureRun);
  }
  return runs.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export function reportIndexHtml(runs: AllureRun[]): string {
  const data = JSON.stringify(runs).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Appium Allure Reports</title>
<style>
body{font:16px system-ui,sans-serif;max-width:1200px;margin:40px auto;padding:0 20px;color:#172b4d;background:#f5f7fb}
h1{margin-bottom:8px}form{display:flex;gap:20px;flex-wrap:wrap;background:white;padding:20px;border-radius:8px}
label{display:grid;gap:6px}input,select,button{font:inherit;padding:8px}table{width:100%;border-collapse:collapse;background:white}
th,td{padding:12px;text-align:left;border-bottom:1px solid #dce2eb}a{color:#075bb5}.table{overflow:auto}
</style></head><body>
<h1>Appium Allure Reports</h1><p>Filter saved runs by environment and execution start date (UTC). Dates are inclusive.</p>
<form id="filters">
<label>Environment<select id="environment"><option value="">All environments</option><option value="mdev">mdev</option><option value="ca-test">catest / ca-test</option><option value="ca-dev">cadev / ca-dev</option></select></label>
<label>From date (UTC)<input id="from" type="date"></label>
<label>To date (UTC)<input id="to" type="date"></label>
<button type="reset">Clear filters</button></form>
<p id="summary" role="status"></p><div class="table"><table><thead><tr><th>Started (UTC)</th><th>Environment</th><th>Platform</th><th>Scenario</th><th>Status</th><th>Report</th></tr></thead><tbody id="runs"></tbody></table></div>
<script>
const runs=${data};
const environment=document.getElementById('environment'),from=document.getElementById('from'),to=document.getElementById('to');
function render(){
 const invalid=from.value&&to.value&&from.value>to.value;
 const filtered=invalid?[]:runs.filter(run=>(!environment.value||run.environment===environment.value)&&(!from.value||run.startedAt.slice(0,10)>=from.value)&&(!to.value||run.startedAt.slice(0,10)<=to.value));
 document.getElementById('summary').textContent=invalid?'From date must be on or before To date.':filtered.length+' of '+runs.length+' runs'+(filtered.length?'':' — no matching runs');
 const body=document.getElementById('runs');body.replaceChildren();
 for(const run of filtered){
  const row=body.insertRow();
  for(const value of [run.startedAt,run.environment,run.platform,run.scenario,run.status])row.insertCell().textContent=value;
  const link=document.createElement('a');link.href='runs/'+encodeURIComponent(run.id)+'/index.html';link.textContent='Open Allure report';row.insertCell().append(link);
 }
}
document.getElementById('filters').addEventListener('input',render);
document.getElementById('filters').addEventListener('reset',()=>setTimeout(render,0));
render();
</script></body></html>`;
}
