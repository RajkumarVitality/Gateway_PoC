import { browser, $, $$ } from '@wdio/globals';
import type { ChainablePromiseElement } from 'webdriverio';
import { settingOr, type MobilePlatform } from '../config/mobileSessionInit.js';
import { executionTimeouts } from '../config/timeoutsHandling.js';

export class MobileSession {
  readonly isIOS: boolean;
  readonly waitTimeout: number;

  constructor(readonly platform: MobilePlatform) {
    this.isIOS = platform === 'iOS';
    this.waitTimeout = executionTimeouts().element;
  }

  getPlatformLocator(androidXpath: string, iosXpath: string): string {
    return this.isIOS ? iosXpath : androidXpath;
  }

  async waitForElement(selector: string, timeout = this.waitTimeout): Promise<ChainablePromiseElement> {
    const deadline = Date.now() + timeout;
    const element = await $(selector);
    while (Date.now() < deadline) {
      if (await element.isExisting()) {
        return element;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await browser.pause(Math.min(250, remaining));
    }
    throw new Error(`Element was not found within ${timeout} ms: ${selector}`);
  }

  async waitForVisibleElement(selector: string, timeout = this.waitTimeout): Promise<ChainablePromiseElement> {
    const deadline = Date.now() + timeout;
    const element = await $(selector);
    while (Date.now() < deadline) {
      if (await element.isDisplayed()) {
        return element;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await browser.pause(Math.min(250, remaining));
    }
    throw new Error(`Element was not visible within ${timeout} ms: ${selector}`);
  }

  async isElementVisible(selector: string, timeout = this.waitTimeout): Promise<boolean> {
    try {
      await this.waitForVisibleElement(selector, timeout);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Element was not visible within ')) {
        return false;
      }
      throw error;
    }
  }

  async clickElement(selector: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await (await this.waitForVisibleElement(selector)).click();
        return;
      } catch (error) {
        if (!isStaleElementError(error) || attempt === 2) {
          throw error;
        }
        await browser.pause(300);
      }
    }
  }

  async typeIntoElement(selector: string, value: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const element = await this.waitForVisibleElement(selector);
        await element.click();
        await element.setValue(value);
        return;
      } catch (error) {
        if (!isStaleElementError(error) || attempt === 2) {
          throw error;
        }
        await browser.pause(300);
      }
    }
  }

  async enterText(
    androidTriggerXpath: string,
    iosTriggerXpath: string,
    androidEditableXpath: string,
    iosEditableXpath: string,
    value: string
  ): Promise<void> {
    await this.clickElement(this.getPlatformLocator(androidTriggerXpath, iosTriggerXpath));
    await browser.pause(500);
    await this.typeIntoElement(this.getPlatformLocator(androidEditableXpath, iosEditableXpath), value);
    await browser.pause(1_000);
  }

  async scrollUp(): Promise<void> {
    const { width, height } = await browser.getWindowSize();
    await browser.performActions([{
      type: 'pointer',
      id: 'scroll-finger',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: Math.floor(width / 2), y: Math.floor(height / 2) },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 200 },
        {
          type: 'pointerMove',
          duration: 1_500,
          x: Math.floor(width / 2),
          y: Math.floor(height * 0.35)
        },
        // Hold before lifting to avoid a fling that overshoots the target.
        { type: 'pause', duration: 300 },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
    await browser.releaseActions();
    await browser.pause(750);
  }

  async findVisibleScrollTarget(selector: string): Promise<WebdriverIO.Element | undefined> {
    const candidates = await $$(selector);
    const { width, height } = await browser.getWindowSize();
    for (const candidate of candidates) {
      if (!await candidate.isDisplayed()) {
        continue;
      }

      // Native drivers can report off-screen elements as displayed.
      const location = await candidate.getLocation();
      const size = await candidate.getSize();
      const centerX = location.x + size.width / 2;
      const centerY = location.y + size.height / 2;
      if (size.width > 0 && size.height > 0
        && centerX >= 0 && centerX < width
        && centerY >= 0 && centerY < height) {
        return candidate;
      
      }
    }
    return undefined;
  }
}

function isStaleElementError(error: unknown): boolean {
  return error instanceof Error && /stale element reference/i.test(error.message);
}
