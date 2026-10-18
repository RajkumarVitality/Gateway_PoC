import { LoginScreen } from '../../src/pages/LoginScreen.js';
import { HomeScreen } from '../../src/pages/HomeScreen.js';
import { requiredSetting, selectedPlatform } from '../../src/config/mobileSessionInit.js';
import { MobileSession } from '../../src/utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { executionReporter } from '../../src/utils/ExecutionReporter.js';
import { assertTestAccountReady, testAccounts } from '../helpers/user_helpers/TestUser.js';

describe('Flutter login and home validation', () => {
  before('verify pre-session member account', assertTestAccountReady);

  it('logs in, validates all home elements and text, and clicks Logout', async () => {
    const username = testAccounts.member;
    const password = requiredSetting('APP_PASSWORD');
    const session = new MobileSession(selectedPlatform());
    const screen = new LoginScreen(session);
    await screen.validateScreen();
    executionReporter.log('Validated all Flutter login screen elements and configured text.');
    await screen.enterUsername(username);
    await screen.dismissKeyboard();
    await screen.enterPassword(password);
    await screen.dismissKeyboard();
    await screen.submit();
    executionReporter.log('Submitted the provisioned member credentials.');
    const homeScreen = new HomeScreen(session);
    await homeScreen.validateScreen();
    await homeScreen.logout();
    executionReporter.log('Validated all configured home elements and text, then clicked Logout.');
  });
});
