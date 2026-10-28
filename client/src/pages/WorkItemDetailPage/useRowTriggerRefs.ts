import { useRef } from 'react';
import type { RefObject } from 'react';

/** One stable ref per row id, for the ⋯ trigger a row's dialog returns focus to. */
export function useRowTriggerRefs(): (rowId: string) => RefObject<HTMLButtonElement | null> {
  const triggerMapRef = useRef(new Map<string, RefObject<HTMLButtonElement | null>>());
  return (rowId) => {
    let triggerRef = triggerMapRef.current.get(rowId);
    if (!triggerRef) {
      triggerRef = { current: null };
      triggerMapRef.current.set(rowId, triggerRef);
    }
    return triggerRef;
  };
}
