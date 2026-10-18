import {
  buildCapabilities,
  cloudEndpoint,
  appIdFor,
  deviceDefaults,
  logSharedAppIdWarning,
  selectedPlatform,
  sessionDashboardUrl,
  setSessionNameFromSpecs,
  settingOr,
  shouldOpenLiveSession
} from './src/config/mobileSessionInit.js';
import { executionReporter } from './src/utils/ExecutionReporter.js';
import { closeLiveSessionTab, openInDefaultBrowser } from './src/utils/browserLauncher.js';
import type { MobilePlatform } from './src/config/mobileSessionInit.js';
import { browser } from '@wdio/globals';
import { addAttachment, addStep, addLabel } from '@wdio/allure-reporter';
import { executionTimeouts } from './src/config/timeoutsHandling.js';
import { resolveScenario, scenarios, suites } from './src/config/runner.js';
import { initializeTestAccountsForSpecs } from './tests/helpers/user_helpers/TestUser.js';
import { sessionAppIdentifier } from './src/utils/mobileAppCleanup.js';
import { selectedEnvironment } from './src/config/userCreation.js';
import { createAllureRun, saveAllureRun, type AllureRun } from './src/utils/allureRuns.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const platform: MobilePlatform = selectedPlatform();
const scenario = resolveScenario(settingOr('LT_SCENARIO', 'loginAndLogout'), platform);
const endpoint = cloudEndpoint();
const testScenario = scenarios[scenario];
const timeouts = executionTimeouts();
const environment = selectedEnvironment();
const runsRoot = fileURLToPath(new URL('./target/allure-runs/', import.meta.url));
const reportRun: AllureRun = process.env.APPIUM_ALLURE_RUN
  ? JSON.parse(process.env.APPIUM_ALLURE_RUN)
  : createAllureRun(environment, platform, scenario);
let liveSessionUrl: string | undefined;
let installedAppId: string | undefined;

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: [`./tests/${testScenario.file}`],
  suites,
  maxInstances: 1,
  capabilities: [buildCapabilities(platform, scenario, testScenario.name)],
  hostname: endpoint.hostname,
  port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
  protocol: endpoint.protocol === 'https:' ? 'https' : 'http',
  path: endpoint.pathname,
  framework: 'mocha',
  reporters: [
    'spec',
    ['allure', {
      outputDir: path.join(runsRoot, reportRun.id, 'results'),
      disableWebdriverStepsReporting: true,
      disableWebdriverScreenshotsReporting: true
    }]
  ],
  logLevel: 'info',
  waitforTimeout: timeouts.element,
  connectionRetryTimeout: 180_000,
  connectionRetryCount: 2,
  mochaOpts: {
    ui: 'bdd',
    timeout: timeouts.test,
    retries: 0
  },
  async onPrepare() {
    process.env.APPIUM_ALLURE_RUN = JSON.stringify(reportRun);
    await saveAllureRun(runsRoot, reportRun);
  },
  async beforeSession(_config, capabilities, specs) {
    try {
      setSessionNameFromSpecs(capabilities, specs);
      await initializeTestAccountsForSpecs(specs);
    } catch (error) {
      console.error('[UserProvisioning] Pre-session setup failed; stopping worker without opening a mobile session.', error);
      // WebdriverIO logs and swallows hook errors; terminate only this worker.
      process.exit(1);
    }
  },
  async before() {
    installedAppId = await sessionAppIdentifier(platform);
    console.log(`[MobileTestRunner] ${platform === 'iOS' ? 'Bundle ID' : 'App package'}: ${installedAppId}`);
  },
  async beforeTest(test) {
    addLabel('environment', environment);
    addLabel('executionDate', reportRun.startedAt.slice(0, 10));
    executionReporter.startTest(test.parent, test.title, { addAttachment, addStep });
    executionReporter.log('Starting test execution.');
    executionReporter.log(`Timeouts: element=${timeouts.element} ms, test=${timeouts.test} ms.`);
    const dashboardUrl = sessionDashboardUrl(browser.sessionId);
    executionReporter.log(`LambdaTest session ID: ${browser.sessionId}`);
    executionReporter.log(`LambdaTest live/recorded session: ${dashboardUrl}`);
    if (shouldOpenLiveSession()) {
      executionReporter.log('Opening the live session in the default browser (set LT_OPEN_LIVE_SESSION=false to disable).');
      openInDefaultBrowser(dashboardUrl, message => executionReporter.log(message));
      liveSessionUrl = dashboardUrl;
    }
    logSharedAppIdWarning(platform);
    const device = deviceDefaults(platform, scenario);
    await browser.pause(platform === 'Android' ? 7_000 : 4_000);
    executionReporter.log(`App identifier retained for post-execution uninstall: ${installedAppId}`);
    await executionReporter.captureTextArtifact(
      'session-config',
      `platform=${platform}\ndevice=${device.device}\nversion=${device.version}\nappId=${appIdFor(platform, scenario)}\nsessionId=${browser.sessionId}\ndashboardUrl=${dashboardUrl}\n`
    );
    await executionReporter.captureScreenshot('app-loaded');
  },
  afterTest: async (_test, _context, result) => {
    if (result.error) {
      executionReporter.log(`Test failed: ${result.error.message}`);
      await executionReporter.captureScreenshot('listener-failure');
      await executionReporter.capturePageSource('listener-failure');
      await executionReporter.finishTest('FAILED');
      return;
    }
    await executionReporter.captureScreenshot('test-passed');
    executionReporter.log('Test passed.');
    await executionReporter.finishTest('PASSED');
  },
  async after() {
    if (!installedAppId) {
      console.error('[MobileTestRunner] App uninstall unavailable: app identification did not complete.');
      process.exitCode = 1;
      return;
    }
    try {
      await browser.removeApp(installedAppId);
      console.log(`[MobileTestRunner] App uninstalled: ${installedAppId}`);
    } catch (error) {
      console.error('[MobileTestRunner] App uninstall failed; the runner will still close the mobile session.', error);
      process.exitCode = 1;
      throw error;
    }
  },
  async afterSession() {
    installedAppId = undefined;
    console.log('[MobileTestRunner] Remote mobile session closed.');
    if (liveSessionUrl) {
      const url = liveSessionUrl;
      liveSessionUrl = undefined;
      console.log('[MobileTestRunner] Closing the live session browser tab/window (best effort).');
      await closeLiveSessionTab(url, message => console.warn(message));
    }
  },
  async onComplete(exitCode) {
    reportRun.finishedAt = new Date().toISOString();
    reportRun.status = exitCode === 0 ? 'PASSED' : 'FAILED';
    await saveAllureRun(runsRoot, reportRun);
    delete process.env.APPIUM_ALLURE_RUN;
    console.log(`[MobileTestRunner] Finished scenario: ${scenario} (${platform}).`);
  }
};
