let lockCount = 0;

/**
 * Ref-counted page scroll lock. Sets `data-scroll-locked` on the root element while at least
 * one lock is held; returns the (idempotent) release function.
 */
export function lockScroll(): () => void {
  lockCount += 1;
  document.documentElement.dataset.scrollLocked = 'true';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) delete document.documentElement.dataset.scrollLocked;
  };
}
