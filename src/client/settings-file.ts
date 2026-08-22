import type { BobbleSettings } from '../shared/types.js';
import { isBobbleSettings } from '../shared/validate.js';

export const SETTINGS_FILE_FORMAT_VERSION = 1;
export const SETTINGS_FILE_SUGGESTED_NAME = 'emdr-assistant-settings.json';

interface SettingsFile extends BobbleSettings { formatVersion: number; }

export function serializeSettings(settings: BobbleSettings): string {
  const file: SettingsFile = { formatVersion: SETTINGS_FILE_FORMAT_VERSION, ...settings };
  return JSON.stringify(file, null, 2);
}

export function parseSettingsFile(text: string): BobbleSettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isBobbleSettings(parsed)) { return null; }

  const { shape, bobbleColor, backgroundColor, size, speed, range, beepOnBounce, beepFrequency } = parsed;
  return { shape, bobbleColor, backgroundColor, size, speed, range, beepOnBounce, beepFrequency };
}
