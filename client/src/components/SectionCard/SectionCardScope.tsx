import { createContext, useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import sharedStyles from '../../styles/shared.module.css';

/** What the scope needs from the card that is in edit mode. */
export interface SectionCardHandle {
  readonly isDirty: () => boolean;
  /** Leaves edit mode without moving focus (the next card is taking over). */
  readonly closeClean: () => void;
  /** Asks "Discard changes?"; `onDiscarded` runs after the user discards. */
  readonly confirmDiscard: (onDiscarded: () => void) => void;
}

export interface SectionCardScopeValue {
  /** Starts `begin` now, or after the open card was closed or its changes discarded. */
  readonly requestEdit: (id: string, handle: SectionCardHandle, begin: () => void) => void;
  /** A card left edit mode. */
  readonly release: (id: string) => void;
  /** Announces through the page's one persistent status region. */
  readonly announce: (message: string) => void;
}

export const SectionCardScopeContext = createContext<SectionCardScopeValue | null>(null);

/**
 * Coordinates the cards of one page: only one is in edit mode at a time (a second Edit closes a
 * clean card silently, or asks "Discard changes?" for a dirty one) and every "‹Section› saved."
 * announcement goes through one persistent visually hidden `role="status"` region (no
 * `aria-live`, no `aria-atomic`). Without a scope a card works standalone.
 */
export function SectionCardScope({ children }: { readonly children: ReactNode }) {
  // Two refs (not one object) so release() compares ids without an optional chain.
  const openIdRef = useRef<string | null>(null);
  const openHandleRef = useRef<SectionCardHandle | null>(null);
  const [message, setMessage] = useState('');

  const requestEdit = useCallback<SectionCardScopeValue['requestEdit']>((id, handle, begin) => {
    const currentHandle = openHandleRef.current;
    const take = () => {
      openIdRef.current = id;
      openHandleRef.current = handle;
      begin();
    };
    if (!currentHandle || openIdRef.current === id) {
      take();
    } else if (!currentHandle.isDirty()) {
      currentHandle.closeClean();
      take();
    } else {
      currentHandle.confirmDiscard(take);
    }
  }, []);

  const release = useCallback((id: string) => {
    if (openIdRef.current === id) {
      openIdRef.current = null;
      openHandleRef.current = null;
    }
  }, []);

  const announce = useCallback((next: string) => setMessage(next), []);

  const value = useMemo<SectionCardScopeValue>(
    () => ({ requestEdit, release, announce }),
    [requestEdit, release, announce],
  );

  return (
    <SectionCardScopeContext value={value}>
      {children}
      <div role="status" className={sharedStyles.srOnly} data-testid="section-card-status">
        {message}
      </div>
    </SectionCardScopeContext>
  );
}
