import assert from 'node:assert/strict';
import { $$ } from '@wdio/globals';
import type { ChainablePromiseElement } from 'webdriverio';
import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { executionReporter } from '../utils/ExecutionReporter.js';

export abstract class BaseScreen {
  protected constructor(protected readonly session: MobileSession) {}

  protected selector(androidXpath: string, iosXpath: string): string {
    return this.session.getPlatformLocator(androidXpath, iosXpath);
  }

  protected element(androidXpath: string, iosXpath: string): Promise<ChainablePromiseElement> {
    return this.session.waitForVisibleElement(this.selector(androidXpath, iosXpath));
  }

  protected isVisible(androidXpath: string, iosXpath: string): Promise<boolean> {
    return this.session.isElementVisible(this.selector(androidXpath, iosXpath));
  }

  protected click(androidXpath: string, iosXpath: string): Promise<void> {
    return this.session.clickElement(this.selector(androidXpath, iosXpath));
  }

  protected async scrollAndClick(androidXpath: string, iosXpath: string, maxSwipes: number): Promise<void> {
    if (!Number.isInteger(maxSwipes) || maxSwipes < 0) {
      throw new RangeError('maxSwipes must be a non-negative integer');
    }

    const targetSelector = this.selector(androidXpath, iosXpath);
    for (let swipe = 0; swipe <= maxSwipes; swipe++) {
      const candidate = await this.session.findVisibleScrollTarget(targetSelector);
      if (candidate) {
        await candidate.click();
        return;
      }

      if (swipe < maxSwipes) {
        await this.session.scrollUp();
      }
    }

    throw new Error(`Element not found after ${maxSwipes} upward scrolls: ${targetSelector}`);
  }

  async printMobileElementsByXpath(xpath: string): Promise<WebdriverIO.ElementArray> {
    if (!xpath.trim()) {
      throw new TypeError('XPath must not be blank');
    }

    const elements = await $$(xpath);
    const count = await elements.length;
    console.log(`Found ${count} mobile elements for XPath: ${xpath}`);
    for (let index = 0; index < count; index++) {
      const element = elements[index];
      console.log(
        `Mobile element ${index + 1}: text=${await element.getText()}, resource-id=${await element.getAttribute('resource-id')}, content-desc=${await element.getAttribute('content-desc')}, label=${await element.getAttribute('label')}, name=${await element.getAttribute('name')}, class=${await element.getAttribute('class')}, value=${await element.getAttribute('value')}`
      );
    }
    return elements.getElements();
  }

  protected type(androidXpath: string, iosXpath: string, value: string): Promise<void> {
    return this.session.typeIntoElement(this.selector(androidXpath, iosXpath), value);
  }

  protected enterText(
    androidTriggerXpath: string,
    iosTriggerXpath: string,
    androidEditableXpath: string,
    iosEditableXpath: string,
    value: string
  ): Promise<void> {
    return this.session.enterText(
      androidTriggerXpath,
      iosTriggerXpath,
      androidEditableXpath,
      iosEditableXpath,
      value
    );
  }

  protected async visibleText(element: ChainablePromiseElement): Promise<string> {
    const text = (await element.getText()).trim();
    if (text) {
      return text;
    }
    const attribute = await element.getAttribute(this.session.isIOS ? 'label' : 'content-desc');
    return attribute?.trim() ?? '';
  }

  protected async assertTextEquals(element: ChainablePromiseElement, expected: string): Promise<string> {
    const attribute = this.session.isIOS ? 'value' : 'content-desc';
    const actual = (await element.getAttribute(attribute) ?? '').trim();
    assert.equal(actual, expected, 'Mobile element text did not match');
    return actual;
  }

  protected async assertTextContains(element: ChainablePromiseElement, expected: string): Promise<string>;
  protected async assertTextContains(element: ChainablePromiseElement, ...fragments: string[]): Promise<void>;
  protected async assertTextContains(
    element: ChainablePromiseElement,
    ...fragments: string[]
  ): Promise<string | void> {
    const attribute = this.session.isIOS ? 'value' : 'content-desc';
    const rawAttribute = await element.getAttribute(attribute);
    const actual = fragments.length === 1
      ? rawAttribute?.trim() ?? ''
      : await this.visibleText(element);

    if (fragments.length === 1) {
      assert.ok(
        actual.includes(fragments[0]),
        `Expected mobile element text to contain "${fragments[0]}" but was: ${actual}`
      );
      return actual;
    }

    assert.ok(
      fragments.some(fragment => actual.includes(fragment)),
      `Expected text to contain one of [${fragments.join(', ')}] but was: ${actual}`
    );
  }

  protected recordStep(message: string): void {
    executionReporter.log(message);
  }

  protected captureCheckpoint(name: string): Promise<string | undefined> {
    return executionReporter.captureScreenshot(name);
  }
}
