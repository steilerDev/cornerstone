/** sessionStorage flag set when the user refused camera access; the host then skips the viewfinder. */
export const CAMERA_DENIED_SESSION_KEY = 'cornerstone.capture.cameraDenied';

/** Plain-http LAN installs are not secure contexts and have no `navigator.mediaDevices`. */
export function isLiveCameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

export function isCameraDeniedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(CAMERA_DENIED_SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

export function rememberCameraDenied(): void {
  try {
    window.sessionStorage.setItem(CAMERA_DENIED_SESSION_KEY, '1');
  } catch {
    // Storage can be unavailable (private windows); the viewfinder simply asks again.
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
