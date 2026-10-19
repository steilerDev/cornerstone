import { use, useLayoutEffect } from 'react';
import { ImmersiveShellContext } from '../components/AppShell/immersiveShellContext.js';

/**
 * While `enabled`, the compact shell does not render its top bar and bottom bar (a full-screen
 * page such as the phone photo viewer). Unmounting the bars keeps them out of the tab order and
 * the accessibility tree. No-op outside the app shell.
 */
export function useImmersiveShell(enabled: boolean): void {
  const shell = use(ImmersiveShellContext);
  useLayoutEffect(() => {
    if (!enabled || !shell) return undefined;
    return shell.register();
  }, [enabled, shell]);
}
