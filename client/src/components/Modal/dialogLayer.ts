import { useLayoutEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/** Open dialogs (Modal and Sheet), in the order they opened. */
const openDialogs: symbol[] = [];

/**
 * Stacking level of a dialog while `active`: 0 for the first open dialog, 1 for one opened over
 * it, and so on. Dialogs stack in open order, whatever their kind or where they sit in the DOM.
 */
export function useDialogLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  useLayoutEffect(() => {
    if (!active) return;
    const token = Symbol('dialog');
    openDialogs.push(token);
    /* eslint-disable @eslint-react/set-state-in-effect -- the level is only known once the dialog is registered */
    setLevel(openDialogs.length - 1);
    /* eslint-enable @eslint-react/set-state-in-effect */
    return () => {
      openDialogs.splice(openDialogs.indexOf(token), 1);
    };
  }, [active]);
  return level;
}

/** z-index for a layer above the base one, or undefined at level 0 (the stylesheet's own). */
export function dialogLayerStyle(level: number, offset = 0): CSSProperties | undefined {
  if (level <= 0) return undefined;
  return { zIndex: `calc(var(--z-modal) + ${level * 2 + offset})` };
}
