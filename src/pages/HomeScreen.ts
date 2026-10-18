import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { MobileElementScreen } from './MobileElementScreen.js';

export class HomeScreen extends MobileElementScreen {
  constructor(
    session: MobileSession,
    storePath: string | URL = new URL('../elements/login.yml', import.meta.url)
  ) {
    super(session, storePath, 'Home Screen');
  }

  assertSectionHeaderVisible(): Promise<void> {
    return this.validateElement('sectionHeader');
  }

  assertDataSourceNameAppleHealthVisible(): Promise<void> {
    return this.validateElement('dataSourceName_AppleHealth');
  }

  assertDataSourceStatusVisible(): Promise<void> {
    return this.validateElement('dataSourceName_Status');
  }

  assertHomeNavigationTitleVisible(): Promise<void> {
    return this.validateElement('homeNavigationTitle');
  }

  assertDashboardOverviewVisible(): Promise<void> {
    return this.validateElement('dashboardOverview');
  }

  assertLinkDescriptionVisible(): Promise<void> {
    return this.validateElement('linkDescription');
  }

  assertActionLinkVisible(): Promise<void> {
    return this.validateElement('actionLink');
  }

  assertLogoutButtonVisible(): Promise<void> {
    return this.validateElement('logoutButton');
  }

  logout(): Promise<void> {
    return this.clickElement('logoutButton');
  }
}
