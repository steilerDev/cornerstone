import { QUICK_LOG_MODES, isQuickLogMode } from '../../navigation/createQuery.js';
import type { QuickLogMode } from '../../navigation/createQuery.js';

export const LAST_QUICK_LOG_KEY = 'cornerstone.newSheet.lastQuickLog';

/** The last chosen Log now tile on this device, or null (missing, invalid, storage blocked). */
export function readLastQuickLog(): QuickLogMode | null {
  try {
    const value = localStorage.getItem(LAST_QUICK_LOG_KEY);
    return isQuickLogMode(value) ? value : null;
  } catch {
    return null;
  }
}

/** Remembers the chosen tile; silent when storage is unavailable (private windows). */
export function writeLastQuickLog(mode: QuickLogMode): void {
  try {
    localStorage.setItem(LAST_QUICK_LOG_KEY, mode);
  } catch {
    // The order is a convenience only.
  }
}

/** Default order photo, note, delivery; the last used one moves first. */
export function orderQuickLogModes(last: QuickLogMode | null): readonly QuickLogMode[] {
  if (!last) return QUICK_LOG_MODES;
  return [last, ...QUICK_LOG_MODES.filter((mode) => mode !== last)];
}
