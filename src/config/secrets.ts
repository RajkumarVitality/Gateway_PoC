import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const prefix = 'ENC[';
const envelope = /^ENC\[v1:([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2})\]$/;

export function secretKey(value = process.env.APPIUM_SECRETS_KEY): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error('APPIUM_SECRETS_KEY must be a Base64-encoded 32-byte encryption key.');
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error('APPIUM_SECRETS_KEY must be a Base64-encoded 32-byte encryption key.');
  }
  return key;
}

export function encryptSecret(value: string, encodedKey = process.env.APPIUM_SECRETS_KEY): string {
  if (!value) throw new Error('Cannot encrypt an empty secret.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `ENC[v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}]`;
}

export function decryptSetting(value: string, name: string): string {
  if (!value.startsWith(prefix)) return value;
  const match = envelope.exec(value);
  if (!match) throw new Error(`Invalid encrypted format for setting ${name}.`);
  const [, ivValue, tagValue, ciphertextValue] = match;
  const iv = Buffer.from(ivValue, 'base64');
  const tag = Buffer.from(tagValue, 'base64');
  const ciphertext = Buffer.from(ciphertextValue, 'base64');
  if (iv.length !== 12 || tag.length !== 16
    || [iv, tag, ciphertext].some((part, index) => part.toString('base64') !== match[index + 1])) {
    throw new Error(`Invalid encrypted format for setting ${name}.`);
  }
  const key = secretKey();
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error(`Unable to decrypt setting ${name}: incorrect key or modified encrypted value.`);
  }
}
