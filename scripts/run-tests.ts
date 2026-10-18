import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { userCreationSetting } from '../src/config/userCreation.js';

type Option<T extends string> = { value: T; label: string; aliases?: string[] };
type Prompt = { question(prompt: string): Promise<string> };

const platforms: Option<string>[] = [
  { value: 'Android', label: 'Android', aliases: ['android'] },
  { value: 'iOS', label: 'iOS', aliases: ['ios'] }
];
const environments: Option<string>[] = [
  { value: 'mdev', label: 'mdev', aliases: ['mdev'] },
  { value: 'ca-test', label: 'catest / ca-test', aliases: ['catest', 'ca-test'] },
  { value: 'ca-dev', label: 'cadev / ca-dev', aliases: ['cadev', 'ca-dev'] }
];

export async function promptSelection<T extends string>(
  prompt: Prompt,
  name: string,
  options: Option<T>[],
  defaultValue: T
): Promise<T> {
  while (true) {
    const choices = options
      .map((option, index) => `${index + 1}- ${option.label}${option.value === defaultValue ? ` (default ${defaultValue})` : ''}`)
      .join('\n');
    const answer = (await prompt.question(`${name}:\n${choices}\n: `)).trim().toLowerCase();
    if (!answer) return defaultValue;
    const selected = options.find((option, index) =>
      answer === String(index + 1)
      || answer === option.value.toLowerCase()
      || option.aliases?.some(alias => answer === alias.toLowerCase())
    );
    if (selected) return selected.value;
    console.log(`Invalid ${name.toLowerCase()}. Choose ${options.map(option => option.label).join(', ')}.`);
  }
}

async function main(): Promise<void> {
  const currentPlatform = process.env.PLATFORM ?? process.env.platform ?? 'iOS';
  const platformOption = platforms.find(option =>
    option.value.toLowerCase() === currentPlatform.toLowerCase()
  );
  if (!platformOption) throw new Error('PLATFORM must be Android or iOS.');
  const platformDefault = platformOption.value;
  const environmentValue = (process.env.VG_ENVIRONMENT ?? userCreationSetting('VG_ENVIRONMENT') ?? 'mdev').toLowerCase();
  const environmentDefault = environments.find(option =>
    option.aliases?.includes(environmentValue)
  )?.value;
  if (!environmentDefault) {
    throw new Error('VG_ENVIRONMENT must be mdev, catest/ca-test, or cadev/ca-dev.');
  }

  if (stdin.isTTY && stdout.isTTY && !process.env.CI) {
    const prompt = createInterface({ input: stdin, output: stdout });
    try {
      process.env.PLATFORM = await promptSelection(prompt, 'Select platform', platforms, platformDefault);
      process.env.VG_ENVIRONMENT = await promptSelection(prompt, 'Select environment', environments, environmentDefault);
    } finally {
      prompt.close();
    }
  } else {
    process.env.PLATFORM = platformDefault;
    process.env.VG_ENVIRONMENT = environmentDefault;
    console.log(`[TestLauncher] Non-interactive run: ${process.env.PLATFORM}, ${process.env.VG_ENVIRONMENT}.`);
  }

  process.env.LT_SCENARIO ||= 'login-logout';
  console.log(`[TestLauncher] Starting ${process.env.LT_SCENARIO} on ${process.env.PLATFORM} (${process.env.VG_ENVIRONMENT}).`);
  const wdioCli = fileURLToPath(new URL('../node_modules/@wdio/cli/bin/wdio.js', import.meta.url));
  const result = spawnSync(process.execPath, [wdioCli, 'run', './wdio.conf.ts', ...process.argv.slice(2)], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: process.env,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`[TestLauncher] ${error instanceof Error ? error.message : 'Test launch failed.'}`);
    process.exitCode = 1;
  });
}
