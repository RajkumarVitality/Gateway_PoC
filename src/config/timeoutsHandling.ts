import { settingOr } from './mobileSessionInit.js';

export function timeoutMilliseconds(key: string, defaultSeconds: number): number {
  const seconds = Number(settingOr(key, String(defaultSeconds)));
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds * 1_000 > 2_147_483_647) {
    throw new Error(`${key} must be a positive number of seconds within the supported timer range.`);
  }
  return seconds * 1_000;
}

export function executionTimeouts(): { element: number; test: number } {
  const element = timeoutMilliseconds('LT_WAIT_SECONDS', 3);
  const test = timeoutMilliseconds('LT_TEST_TIMEOUT_SECONDS', 900);
  if (test <= element) {
    throw new Error('LT_TEST_TIMEOUT_SECONDS must be greater than LT_WAIT_SECONDS so element waits can report their errors.');
  }
  return { element, test };
}
