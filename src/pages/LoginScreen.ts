import { browser } from '@wdio/globals';
import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { MobileElementScreen } from './MobileElementScreen.js';

export class LoginScreen extends MobileElementScreen {
  constructor(
    session: MobileSession,
    storePath: string | URL = new URL('../elements/login.yml', import.meta.url)
  ) {
    super(session, storePath, 'LoginScreen and WelcomeScreen');
  }

  welcomeBack(): Promise<void> {
    return this.validateScreen();
  }

  assertHelloVisible(): Promise<void> {
    return this.welcomeBack();
  }

  async enterUsername(username: string): Promise<void> {
    await this.typeIntoElement('usernameField', username);
  }

  async dismissKeyboard(): Promise<void> {
    await this.clickElement('welcomeMessage');
  }

  async enterPassword(password: string): Promise<void> {
    await this.typeIntoElement('passwordField', password);
    await browser.pause(300);
  }

  async submit(): Promise<void> {
    await this.clickElement('loginButton');
  }
}
