import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  const vv = window.visualViewport;
  vv?.addEventListener('resize', onChange);
  window.addEventListener('resize', onChange);
  return () => {
    vv?.removeEventListener('resize', onChange);
    window.removeEventListener('resize', onChange);
  };
}

/** The visual viewport shrank well below the layout viewport. Pinch-zoom (scale) does not count. */
function getSnapshot(): boolean {
  const vv = window.visualViewport;
  return vv ? vv.height * vv.scale < 0.75 * window.innerHeight : false;
}

const getServerSnapshot = (): boolean => false;

/** True while an on-screen keyboard is likely open. */
export function useOnScreenKeyboard(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
