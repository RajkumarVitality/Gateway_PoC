import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { loadElementStore, type MobileElement, type MobileElementStore } from '../utils/mobileElementStore.js';

export abstract class MobileElementScreen {
  private store?: Promise<MobileElementStore>;

  protected constructor(
    protected readonly session: MobileSession,
    private readonly storePath: string | URL,
    private readonly screen: string
  ) {}

  private elementStore(): Promise<MobileElementStore> {
    return this.store ??= loadElementStore(this.storePath, this.screen);
  }

  private async definition(name: string): Promise<MobileElement> {
    const store = await this.elementStore();
    if (!Object.hasOwn(store.elements, name)) {
      throw new Error(`Missing element "${name}" in ${store.screen} element store`);
    }
    return store.elements[name];
  }

  protected async selector(name: string): Promise<string> {
    const element = await this.definition(name);
    return this.session.getPlatformLocator(element.android, element.ios);
  }

  protected async clickElement(name: string): Promise<void> {
    await this.session.clickElement(await this.selector(name));
  }
  assertTextVisible(name: string): Promise<void> {
    return this.validateElement(name);
  }

  assertElementVisible(name: string): Promise<void> {
    return this.validateElement(name);
  }

  protected async typeIntoElement(name: string, value: string): Promise<void> {
    await this.session.typeIntoElement(await this.selector(name), value);
  }

  async validateElement(name: string): Promise<void> {
    const definition = await this.definition(name);
    const element = await this.session.waitForVisibleElement(
      this.session.getPlatformLocator(definition.android, definition.ios)
    );
    if (!definition.validation) return;

    const text = (await element.getText()).trim();
    const actual = text || (await element.getAttribute(this.session.isIOS ? 'value' : 'content-desc') ?? '').trim();
    const { match, text: expected } = definition.validation;
    const matches = match === 'equals' ? actual === expected : actual.includes(expected);
    if (!matches) {
      throw new Error(`${this.constructor.name}.${name}: expected text to ${match} "${expected}" but found "${actual}"`);
    }
  }

  async validateScreen(): Promise<void> {
    for (const name of Object.keys((await this.elementStore()).elements)) {
      await this.validateElement(name);
    }
  }
}
