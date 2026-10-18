import { browser } from '@wdio/globals';
import { appToUninstall, type MobilePlatform } from '../config/mobileSessionInit.js';

function identifier(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function capabilityValue(capabilities: unknown, key: string): unknown {
  if (capabilities && typeof capabilities === 'object' && key in capabilities) {
    return Reflect.get(capabilities, key);
  }
  return undefined;
}

export async function sessionAppIdentifier(platform: MobilePlatform): Promise<string> {
  const configured = appToUninstall(platform);
  if (configured) return configured;
  const key = platform === 'iOS' ? 'bundleId' : 'appPackage';
  let appId = identifier(capabilityValue(browser.capabilities, `appium:${key}`))
    ?? identifier(capabilityValue(browser.capabilities, key));
  if (!appId && platform === 'iOS') {
    const info: unknown = await browser.execute('mobile: activeAppInfo');
    if (info && typeof info === 'object' && 'bundleId' in info) appId = identifier(info.bundleId);
  } else if (!appId) {
    appId = identifier(await browser.getCurrentPackage());
  }
  if (!appId || appId.startsWith('com.apple.') || appId === 'com.android.systemui') {
    throw new Error(`Cannot identify the tested ${platform} app for uninstall. Set ${platform === 'iOS' ? 'IOS_BUNDLE_ID' : 'ANDROID_APP_PACKAGE'} explicitly.`);
  }
  return appId;
}
