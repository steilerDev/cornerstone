const STORAGE_KEY = 'singleKeyShortcuts';

/** Single-key shortcuts are on unless this browser stored 'off' (WCAG 2.1.4 off switch). */
export function readSingleKeyShortcutsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true; // storage unavailable (strict private mode)
  }
}

export function writeSingleKeyShortcutsEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, 'off');
  } catch {
    // storage unavailable: the choice lasts for this page load only
  }
}
