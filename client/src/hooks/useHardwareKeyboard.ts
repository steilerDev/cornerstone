import { useSyncExternalStore } from 'react';
import { useMediaQuery } from './useMediaQuery.js';

const listeners = new Set<() => void>();
let keySeen = false;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('input, textarea, select, [contenteditable]') !== null;
}

function onKeyDown(event: KeyboardEvent): void {
  if (keySeen || isEditable(event.target)) return;
  keySeen = true;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) document.addEventListener('keydown', onKeyDown);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) document.removeEventListener('keydown', onKeyDown);
  };
}

const getSnapshot = (): boolean => keySeen;
const getServerSnapshot = (): boolean => false;

/**
 * True when a physical keyboard is likely present: a fine pointer, or a key pressed outside an
 * editable field this session (on-screen keyboards only type into editable fields).
 */
export function useHardwareKeyboard(): boolean {
  const finePointer = useMediaQuery('(any-pointer: fine)');
  const seen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return finePointer || seen;
}
