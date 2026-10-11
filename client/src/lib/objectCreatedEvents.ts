import { useEffect, useRef } from 'react';

const EVENT_NAME = 'cornerstone:object-created';

/** Tells list pages behind a dialog that an object of `kind` was created. */
export function notifyObjectCreated(kind: string): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { kind } }));
}

/** Runs `callback` whenever an object of `kind` is created (the callback may change freely). */
export function useOnObjectCreated(kind: string, callback: () => void): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  useEffect(() => {
    const handler = (event: Event) => {
      if ((event as CustomEvent<{ kind?: string }>).detail?.kind === kind) callbackRef.current();
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [kind]);
}
