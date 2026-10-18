import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { decryptSetting, encryptSecret, secretKey } from '../src/config/secrets.js';

function encryptionKey(): string {
  if (process.env.APPIUM_SECRETS_KEY !== undefined) {
    secretKey();
    return process.env.APPIUM_SECRETS_KEY;
  }
  const directory = path.join(homedir(), '.config', 'appium-gateway');
  const keyFile = path.join(directory, 'secrets.env');
  if (existsSync(keyFile)) {
    if ((statSync(keyFile).mode & 0o077) !== 0) {
      throw new Error('The private secrets.env file must have owner-only permissions (chmod 600).');
    }
    const match = /^export APPIUM_SECRETS_KEY='([A-Za-z0-9+/]{43}=)'\n?$/.exec(readFileSync(keyFile, 'utf8'));
    if (!match) throw new Error('The private secrets.env file has an invalid format.');
    secretKey(match[1]);
    return match[1];
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const key = randomBytes(32).toString('base64');
  writeFileSync(keyFile, `export APPIUM_SECRETS_KEY='${key}'\n`, { mode: 0o600, flag: 'wx' });
  return key;
}

try {
  const propertyFile = path.resolve(process.argv[2] ?? 'lambdatest.properties');
  const contents = readFileSync(propertyFile, 'utf8');
  const key = encryptionKey();
  process.env.APPIUM_SECRETS_KEY = key;
  const found = new Set<string>();
  const encrypted = contents.replace(
    /^([ \t]*(LT_ACCESS_KEY|AccessKey|APP_PASSWORD)[ \t]*[=:][ \t]*)([^\r\n]*)/gm,
    (_line: string, start: string, name: string, rawValue: string) => {
      const value = rawValue.trim();
      if (!value) throw new Error(`Cannot encrypt empty setting ${name}.`);
      found.add(name);
      if (value.startsWith('ENC[')) {
        decryptSetting(value, name);
        return `${start}${value}`;
      }
      return `${start}${encryptSecret(value, key)}`;
    }
  );
  if (!found.has('APP_PASSWORD') || (!found.has('LT_ACCESS_KEY') && !found.has('AccessKey'))) {
    throw new Error('The properties file must contain APP_PASSWORD and LT_ACCESS_KEY (or AccessKey).');
  }
  const temporaryFile = `${propertyFile}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temporaryFile, encrypted, { mode: 0o600, flag: 'wx' });
    renameSync(temporaryFile, propertyFile);
  } finally {
    rmSync(temporaryFile, { force: true });
  }
  console.log('Encrypted LT access key and app password. No secret values were printed.');
  console.log('Before running tests, load your key: source ~/.config/appium-gateway/secrets.env');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Secret encryption failed.');
  process.exitCode = 1;
}
