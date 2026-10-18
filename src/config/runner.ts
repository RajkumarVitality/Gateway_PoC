import type { MobilePlatform } from './mobileSessionInit.js';

export const scenarios = {
  'login-logout': {
    file: 'smoke/login-logout.spec.ts',
    name: 'Validate the Login and Logout Functionality for Flutter and Native iOS Demo build',
    provisionMember: true
  }
};

export type Scenario = keyof typeof scenarios;

export function isLoginLogoutScenario(value: string): boolean {
  return ['login-logout', 'flutter-login-screen', 'loginAndLogout'].includes(value);
}

export const suites = {
  smoke: [`./tests/${scenarios['login-logout'].file}`],
  regression: [`./tests/${scenarios['login-logout'].file}`]
};

export function resolveScenario(value: string, _platform: MobilePlatform): Scenario {
  if (isLoginLogoutScenario(value)) return 'login-logout';
  throw new Error(`Unsupported LT_SCENARIO "${value}". Choose one of: login-logout (flutter-login-screen and loginAndLogout are legacy aliases).`);
}
