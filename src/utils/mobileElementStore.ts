import { readFile } from 'node:fs/promises';
import { parseAllDocuments } from 'yaml';

export interface MobileElement {
  android: string;
  ios: string;
  validation?: { match: 'equals' | 'includes'; text: string };
}

export interface MobileElementStore {
  version: 1;
  screen: string;
  elements: Record<string, MobileElement>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${path} must be a non-empty string`);
}

function checkKeys(value: Record<string, unknown>, allowed: string[], path: string, errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key} is not supported`);
  }
}

export function validateElementStore(value: unknown): asserts value is MobileElementStore {
  if (!isRecord(value)) throw new Error('Element store must be a YAML mapping');
  const errors: string[] = [];
  checkKeys(value, ['version', 'screen', 'elements'], 'store', errors);
  if (value.version !== 1) errors.push('version must be 1');
  requireText(value.screen, 'screen', errors);
  if (!isRecord(value.elements) || Object.keys(value.elements).length === 0) {
    errors.push('elements must be a non-empty mapping');
  } else {
    for (const [name, element] of Object.entries(value.elements)) {
      const path = `elements.${name}`;
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) errors.push(`${path} must have an identifier-style name`);
      if (!isRecord(element)) {
        errors.push(`${path} must be a mapping`);
        continue;
      }
      checkKeys(element, ['android', 'ios', 'validation'], path, errors);
      requireText(element.android, `${path}.android`, errors);
      requireText(element.ios, `${path}.ios`, errors);
      if (Object.hasOwn(element, 'validation')) {
        if (!isRecord(element.validation)) {
          errors.push(`${path}.validation must be a mapping`);
        } else {
          checkKeys(element.validation, ['match', 'text'], `${path}.validation`, errors);
          if (element.validation.match !== 'equals' && element.validation.match !== 'includes') {
            errors.push(`${path}.validation.match must be equals or includes`);
          }
          requireText(element.validation.text, `${path}.validation.text`, errors);
        }
      }
    }
  }
  if (errors.length) throw new Error(`Invalid element store:\n- ${errors.join('\n- ')}`);
}

export function parseElementStores(source: string): MobileElementStore[] {
  const documents = parseAllDocuments(source);
  if (!documents.length) throw new Error('Element store must contain at least one YAML document');
  const stores: MobileElementStore[] = [];
  const screens = new Set<string>();
  for (const document of documents) {
    if (document.errors.length || document.warnings.length) {
      throw new Error(`Invalid YAML:\n${[...document.errors, ...document.warnings].map(error => error.message).join('\n')}`);
    }
    const value: unknown = document.toJS({ maxAliasCount: 100 });
    validateElementStore(value);
    if (screens.has(value.screen)) throw new Error(`Duplicate screen "${value.screen}" in element store`);
    screens.add(value.screen);
    stores.push(value);
  }
  return stores;
}

export function parseElementStore(source: string, screen?: string): MobileElementStore {
  const stores = parseElementStores(source);
  if (screen !== undefined) {
    const store = stores.find(store => store.screen === screen);
    if (!store) throw new Error(`Missing screen "${screen}" in element store`);
    return store;
  }
  if (stores.length !== 1) throw new Error('Specify a screen when loading a multi-screen element store');
  return stores[0];
}

export async function loadElementStores(path: string | URL): Promise<MobileElementStore[]> {
  return parseElementStores(await readFile(path, 'utf8'));
}

export async function loadElementStore(path: string | URL, screen?: string): Promise<MobileElementStore> {
  return parseElementStore(await readFile(path, 'utf8'), screen);
}
