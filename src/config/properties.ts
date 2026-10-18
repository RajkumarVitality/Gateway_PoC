import { readFileSync } from 'node:fs';

export function loadProperties(propertyFiles: string[]): Map<string, string> {
  const properties = new Map<string, string>();
  for (const filePath of propertyFiles) {
    try {
      const fileContents = readFileSync(filePath, 'utf8');
      for (const line of fileContents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
          continue;
        }
        const separatorIndex = trimmed.search(/[=:]/);
        if (separatorIndex < 0) {
          properties.set(trimmed, '');
          continue;
        }
        properties.set(trimmed.slice(0, separatorIndex).trim(), trimmed.slice(separatorIndex + 1).trim());
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Unable to read settings file ${filePath}`, { cause: error });
      }
    }
  }
  return properties;
}
