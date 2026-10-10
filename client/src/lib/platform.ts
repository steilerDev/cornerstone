/** True on macOS / iOS / iPadOS (the command key is the shortcut modifier). */
export function isApplePlatform(
  nav: Pick<Navigator, 'platform' | 'userAgent'> = navigator,
): boolean {
  return /Mac|iPhone|iPad|iPod/.test(nav.platform || nav.userAgent);
}
